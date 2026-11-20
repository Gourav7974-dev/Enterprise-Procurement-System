package com.eps.procurement.controller;

import com.eps.procurement.store.DemoStateStore;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Shared-state sync endpoints used by the demo frontend across browsers. */
@RestController
@RequestMapping("/api/demo-state")
public class DemoStateController {

    private final DemoStateStore state;

    public DemoStateController(DemoStateStore state) {
        this.state = state;
    }

    @GetMapping
    public ObjectNode read() {
        return state.read();
    }

    @PutMapping
    @ResponseStatus(HttpStatus.OK)
    public ResponseEntity<ObjectNode> write(@RequestBody JsonNode body) {
        try {
            if (body != null && body.isObject() && body.has("data") && body.has("revision")) {
                return ResponseEntity.ok(state.write(body.get("data"), body.get("revision").asLong()));
            }
            // Compatibility with older clients that send a bare snapshot.
            return ResponseEntity.ok(state.write(body));
        } catch (DemoStateStore.RevisionConflictException conflict) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(state.read());
        }
    }
}
