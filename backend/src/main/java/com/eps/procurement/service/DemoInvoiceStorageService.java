package com.eps.procurement.service;

import com.eps.procurement.store.DemoStateStore;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/** Stores uploaded invoice PDFs and updates the same shared snapshot used by every role. */
@Service
public class DemoInvoiceStorageService {

    private static final long MAX_FILE_BYTES = 10L * 1024 * 1024;

    private final DemoStateStore state;
    private final Path invoiceDirectory;

    public DemoInvoiceStorageService(
            DemoStateStore state,
            @Value("${eps.demo.invoice-dir:./data/invoices}") String invoiceDirectory) {
        this.state = state;
        this.invoiceDirectory = Path.of(invoiceDirectory).toAbsolutePath().normalize();
    }

    public ObjectNode upload(String poId, String supplierId, String invoiceNumber,
                             double invoiceAmount, String invoiceDate, MultipartFile file) {
        if (poId == null || poId.isBlank() || supplierId == null || supplierId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Purchase order and supplier are required.");
        }
        if (invoiceNumber == null || invoiceNumber.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice number is required.");
        }
        if (!Double.isFinite(invoiceAmount) || invoiceAmount <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice amount must be greater than zero.");
        }
        if (invoiceDate == null || invoiceDate.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice date is required.");
        }
        try {
            LocalDate.parse(invoiceDate);
        } catch (RuntimeException invalidDate) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice date must use YYYY-MM-DD format.");
        }
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select an invoice PDF to upload.");
        }
        if (file.getSize() > MAX_FILE_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Invoice PDF must be 10 MB or smaller.");
        }

        final byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read the uploaded invoice.");
        }
        if (bytes.length < 5 || bytes[0] != '%' || bytes[1] != 'P' || bytes[2] != 'D'
                || bytes[3] != 'F' || bytes[4] != '-') {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The selected file is not a valid PDF.");
        }

        String fileId = UUID.randomUUID().toString();
        Path savedFile = invoiceDirectory.resolve(fileId + ".pdf").normalize();
        AtomicBoolean fileWritten = new AtomicBoolean(false);
        String originalFileName = safeFileName(file.getOriginalFilename());
        String uploadedAt = OffsetDateTime.now().withNano(0).toString();
        String message = "Invoice " + invoiceNumber + " for " + poId + " is ready for verification.";

        try {
            return state.update(data -> {
                ObjectNode po = findById(data.withArray("purchaseOrders"), poId);
                if (po == null) {
                    throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Purchase order not found.");
                }
                if (!supplierId.equalsIgnoreCase(po.path("supplierId").asText())) {
                    throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                            "This purchase order is not assigned to the signed-in supplier.");
                }
                String poStatus = po.path("status").asText("").toLowerCase();
                if ("cancelled".equals(poStatus) || "rejected".equals(poStatus) || "closed".equals(poStatus)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "Invoices cannot be uploaded for a closed, cancelled, or rejected order.");
                }

                ArrayNode payments = data.withArray("payments");
                ObjectNode payment = findByPo(payments, poId);
                if (payment != null && "paid".equalsIgnoreCase(payment.path("status").asText())) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "A paid purchase order cannot receive another invoice.");
                }

                try {
                    Files.createDirectories(invoiceDirectory);
                    Files.write(savedFile, bytes, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
                    fileWritten.set(true);
                } catch (IOException e) {
                    throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                            "Invoice file could not be stored. Check the configured persistent disk path.");
                }

                po.put("invoiceNumber", invoiceNumber.trim());
                po.put("invoiceAmount", invoiceAmount);
                po.put("invoiceDate", invoiceDate);
                po.put("invoiceFileName", originalFileName);
                po.put("invoiceFileId", fileId);
                po.put("invoiceUploadedAt", uploadedAt);
                po.put("invoiceStatus", "pending");

                if (payment == null) {
                    payment = payments.addObject();
                    payment.put("id", "PAY-" + LocalDate.now().getYear() + "-" + UUID.randomUUID().toString().substring(0, 8));
                    payment.put("poId", poId);
                    payment.put("poNumber", poId);
                    copyIfPresent(po, payment, "requestId");
                    copyIfPresent(po, payment, "supplierId");
                    copyIfPresent(po, payment, "supplierName");
                    payment.put("status", "pending");
                    payment.putNull("paidDate");
                    payment.putNull("verifiedBy");
                    payment.putNull("transactionId");
                }
                payment.put("poId", poId);
                payment.put("poNumber", poId);
                copyIfPresent(po, payment, "requestId");
                copyIfPresent(po, payment, "supplierId");
                copyIfPresent(po, payment, "supplierName");
                payment.put("invoiceNumber", invoiceNumber.trim());
                payment.put("invoiceAmount", invoiceAmount);
                payment.put("invoiceDate", invoiceDate);
                payment.put("amount", invoiceAmount);
                payment.put("invoiceFileId", fileId);
                payment.put("invoiceFileName", originalFileName);
                payment.put("invoiceUploadedAt", uploadedAt);

                ArrayNode users = data.withArray("users");
                ArrayNode notifications = data.withArray("notifications");
                for (JsonNode user : users) {
                    if (!"active".equalsIgnoreCase(user.path("status").asText())
                            || !"finance_officer".equalsIgnoreCase(user.path("role").asText())) {
                        continue;
                    }
                    String userId = user.path("id").asText();
                    boolean alreadyNotified = false;
                    for (JsonNode existing : notifications) {
                        if (userId.equals(existing.path("userId").asText())
                                && "invoice_uploaded".equals(existing.path("type").asText())
                                && message.equals(existing.path("message").asText())) {
                            alreadyNotified = true;
                            break;
                        }
                    }
                    if (!alreadyNotified) {
                        ObjectNode notification = notifications.addObject();
                        notification.put("id", "N" + UUID.randomUUID().toString().replace("-", "").substring(0, 12));
                        notification.put("userId", userId);
                        notification.put("type", "invoice_uploaded");
                        notification.put("title", "Supplier Invoice Uploaded");
                        notification.put("message", message);
                        notification.put("read", false);
                        notification.put("createdAt", uploadedAt);
                        notification.put("link", "/finance/payments");
                    }
                }
                return data;
            });
        } catch (RuntimeException failure) {
            if (fileWritten.get()) {
                try {
                    Files.deleteIfExists(savedFile);
                } catch (IOException ignored) {
                    // Keep the original workflow failure; orphan cleanup is safe on the next maintenance pass.
                }
            }
            throw failure;
        }
    }

    public Path filePath(String fileId) {
        try {
            UUID.fromString(fileId);
        } catch (RuntimeException invalidId) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Invoice file not found.");
        }
        Path path = invoiceDirectory.resolve(fileId + ".pdf").normalize();
        if (!path.startsWith(invoiceDirectory) || !Files.isRegularFile(path)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Invoice file not found.");
        }
        return path;
    }

    private static ObjectNode findById(ArrayNode records, String id) {
        for (JsonNode record : records) {
            if (id.equalsIgnoreCase(record.path("id").asText())) return (ObjectNode) record;
        }
        return null;
    }

    private static ObjectNode findByPo(ArrayNode payments, String poId) {
        for (JsonNode record : payments) {
            if (poId.equalsIgnoreCase(record.path("poId").asText())
                    || poId.equalsIgnoreCase(record.path("poNumber").asText())) return (ObjectNode) record;
        }
        return null;
    }

    private static void copyIfPresent(ObjectNode source, ObjectNode target, String field) {
        JsonNode value = source.get(field);
        if (value != null) target.set(field, value.deepCopy());
    }

    private static String safeFileName(String name) {
        String cleaned = StringUtils.cleanPath(name == null ? "invoice.pdf" : name)
                .replace("\\", "_").replace("/", "_");
        if (cleaned.isBlank() || cleaned.equals(".")) return "invoice.pdf";
        return cleaned.length() > 160 ? cleaned.substring(cleaned.length() - 160) : cleaned;
    }
}
