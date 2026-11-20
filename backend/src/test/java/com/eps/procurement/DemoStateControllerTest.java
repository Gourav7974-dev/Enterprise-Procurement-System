package com.eps.procurement;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.eps.procurement.controller.DemoStateController;
import com.eps.procurement.store.DemoStateStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class DemoStateControllerTest {

    @TempDir
    Path temporaryDirectory;

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        ObjectMapper mapper = new ObjectMapper();
        DemoStateStore state = new DemoStateStore(mapper,
                temporaryDirectory.resolve("shared-state.json").toString());
        mvc = MockMvcBuilders.standaloneSetup(new DemoStateController(state)).build();
    }

    @Test
    void acceptsAWorkflowSnapshotAndReturnsItOnTheNextRead() throws Exception {
        mvc.perform(put("/api/demo-state")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requests\":[{\"id\":\"REQ-DEMO-2\"}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revision").value(1));

        mvc.perform(get("/api/demo-state"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.requests[0].id").value("REQ-DEMO-2"));
    }
}
