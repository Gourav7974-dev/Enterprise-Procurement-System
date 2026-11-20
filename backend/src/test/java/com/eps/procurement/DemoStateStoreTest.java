package com.eps.procurement;

import static org.assertj.core.api.Assertions.assertThat;

import com.eps.procurement.store.DemoStateStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DemoStateStoreTest {

    @TempDir
    Path temporaryDirectory;

    @Test
    void writesSharedStateAndRestoresItAfterRestart() {
        Path file = temporaryDirectory.resolve("shared-state.json");
        ObjectMapper mapper = new ObjectMapper();
        DemoStateStore firstRun = new DemoStateStore(mapper, file.toString());
        ObjectNode initialData = mapper.createObjectNode();
        initialData.putArray("requests").addObject().put("id", "REQ-DEMO-1");

        ObjectNode written = firstRun.write(initialData);
        assertThat(written.path("revision").asLong()).isEqualTo(1);
        assertThat(written.at("/data/requests/0/id").asText()).isEqualTo("REQ-DEMO-1");

        DemoStateStore restarted = new DemoStateStore(mapper, file.toString());
        restarted.load();

        assertThat(restarted.read().path("revision").asLong()).isEqualTo(1);
        assertThat(restarted.read().at("/data/requests/0/id").asText()).isEqualTo("REQ-DEMO-1");
    }
}
