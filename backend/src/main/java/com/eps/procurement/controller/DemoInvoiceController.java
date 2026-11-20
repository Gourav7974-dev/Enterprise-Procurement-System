package com.eps.procurement.controller;

import com.eps.procurement.service.DemoInvoiceStorageService;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Path;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Demo invoice upload/download endpoints backed by the shared workflow snapshot. */
@RestController
@RequestMapping("/api/demo-state/invoices")
public class DemoInvoiceController {

    private final DemoInvoiceStorageService invoices;

    public DemoInvoiceController(DemoInvoiceStorageService invoices) {
        this.invoices = invoices;
    }

    @PostMapping(value = "/{poId}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ObjectNode upload(@PathVariable String poId,
                             @RequestParam String supplierId,
                             @RequestParam String invoiceNumber,
                             @RequestParam double invoiceAmount,
                             @RequestParam String invoiceDate,
                             @RequestParam("file") MultipartFile file) {
        return invoices.upload(poId, supplierId, invoiceNumber, invoiceAmount, invoiceDate, file);
    }

    @GetMapping("/{fileId}")
    public ResponseEntity<Resource> download(@PathVariable String fileId) {
        Path file = invoices.filePath(fileId);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.inline().filename("supplier-invoice.pdf").build().toString())
                .body(new FileSystemResource(file));
    }
}
