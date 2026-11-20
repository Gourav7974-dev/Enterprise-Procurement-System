package com.eps.procurement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eps.procurement.service.DemoInvoiceStorageService;
import com.eps.procurement.store.DemoStateStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.http.MediaType;
import com.eps.procurement.controller.DemoInvoiceController;
import org.springframework.web.server.ResponseStatusException;

class DemoInvoiceStorageServiceTest {

    @TempDir
    Path temporaryDirectory;

    @Test
    void storesPdfAndUpdatesPurchaseOrderPaymentAndFinanceNotificationInSharedState() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        DemoStateStore state = new DemoStateStore(mapper, temporaryDirectory.resolve("state.json").toString());
        ObjectNode data = mapper.createObjectNode();
        data.putArray("users").addObject().put("id", "U010").put("role", "finance_officer").put("status", "active");
        data.putArray("purchaseOrders").addObject()
                .put("id", "PO-DEMO-1").put("supplierId", "S001").put("supplierName", "Demo Supplier")
                .put("requestId", "REQ-DEMO-1").put("status", "accepted").put("totalAmount", 1000);
        data.putArray("payments");
        data.putArray("notifications");
        state.write(data);

        DemoInvoiceStorageService service = new DemoInvoiceStorageService(
                state, temporaryDirectory.resolve("invoices").toString());
        byte[] pdf = "%PDF-1.4\nDemo invoice".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        MockMultipartFile file = new MockMultipartFile("file", "invoice.pdf", "application/pdf", pdf);

        ObjectNode result = service.upload("PO-DEMO-1", "S001", "INV-DEMO-1", 975,
                "2026-11-21", file);
        String fileId = result.at("/data/purchaseOrders/0/invoiceFileId").asText();
        assertThat(result.at("/data/purchaseOrders/0/invoiceNumber").asText()).isEqualTo("INV-DEMO-1");
        assertThat(result.at("/data/purchaseOrders/0/invoiceAmount").asDouble()).isEqualTo(975);
        assertThat(result.at("/data/payments/0/invoiceFileId").asText()).isEqualTo(fileId);
        assertThat(result.at("/data/payments/0/supplierId").asText()).isEqualTo("S001");
        assertThat(result.at("/data/notifications/0/userId").asText()).isEqualTo("U010");
        assertThat(result.at("/data/notifications/0/type").asText()).isEqualTo("invoice_uploaded");
        assertThat(Files.readAllBytes(service.filePath(fileId))).containsExactly(pdf);

        DemoStateStore restarted = new DemoStateStore(mapper, temporaryDirectory.resolve("state.json").toString());
        restarted.load();
        assertThat(restarted.read().at("/data/payments/0/invoiceNumber").asText()).isEqualTo("INV-DEMO-1");
    }

    @Test
    void rejectsWrongSupplierAndNonPdfWithoutChangingTheSharedRevision() {
        ObjectMapper mapper = new ObjectMapper();
        DemoStateStore state = new DemoStateStore(mapper, temporaryDirectory.resolve("state.json").toString());
        ObjectNode data = mapper.createObjectNode();
        data.putArray("purchaseOrders").addObject()
                .put("id", "PO-DEMO-1").put("supplierId", "S001").put("status", "sent");
        state.write(data);
        DemoInvoiceStorageService service = new DemoInvoiceStorageService(
                state, temporaryDirectory.resolve("invoices").toString());
        MockMultipartFile invalidPdf = new MockMultipartFile("file", "invoice.pdf", "application/pdf",
                "not a pdf".getBytes(java.nio.charset.StandardCharsets.US_ASCII));

        assertThatThrownBy(() -> service.upload("PO-DEMO-1", "S002", "INV-1", 100,
                "2026-11-21", invalidPdf)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.upload("PO-DEMO-1", "S001", "INV-1", 100,
                "2026-11-21", invalidPdf)).isInstanceOf(ResponseStatusException.class);
        assertThat(state.read().path("revision").asLong()).isEqualTo(1);
        assertThat(Files.exists(temporaryDirectory.resolve("invoices"))).isFalse();
    }

    @Test
    void multipartApiReturnsStoredMetadataAndServesTheSamePdf() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        DemoStateStore state = new DemoStateStore(mapper, temporaryDirectory.resolve("api-state.json").toString());
        ObjectNode data = mapper.createObjectNode();
        data.putArray("users").addObject().put("id", "U010").put("role", "finance_officer").put("status", "active");
        data.putArray("purchaseOrders").addObject()
                .put("id", "PO-API-1").put("supplierId", "S001").put("status", "sent").put("totalAmount", 200);
        data.putArray("payments");
        data.putArray("notifications");
        state.write(data);
        DemoInvoiceStorageService service = new DemoInvoiceStorageService(
                state, temporaryDirectory.resolve("api-invoices").toString());
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new DemoInvoiceController(service)).build();
        byte[] pdf = "%PDF-1.4\nAPI test".getBytes(java.nio.charset.StandardCharsets.US_ASCII);

        String response = mvc.perform(multipart("/api/demo-state/invoices/PO-API-1")
                        .file(new MockMultipartFile("file", "invoice.pdf", MediaType.APPLICATION_PDF_VALUE, pdf))
                        .param("supplierId", "S001")
                        .param("invoiceNumber", "INV-API-1")
                        .param("invoiceAmount", "198")
                        .param("invoiceDate", "2026-11-21"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.purchaseOrders[0].invoiceNumber").value("INV-API-1"))
                .andReturn().getResponse().getContentAsString();
        String fileId = mapper.readTree(response).at("/data/purchaseOrders/0/invoiceFileId").asText();

        mvc.perform(get("/api/demo-state/invoices/" + fileId))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andExpect(content().bytes(pdf));
    }
}
