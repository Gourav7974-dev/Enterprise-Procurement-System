package com.eps.procurement.store;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.function.UnaryOperator;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Shared, file-backed state for the browser-based procurement demo. */
@Component
public class DemoStateStore {

    private final ObjectMapper mapper;
    private final Path stateFile;
    private JsonNode data;
    private long revision;

    public DemoStateStore(
            ObjectMapper mapper,
            @Value("${eps.demo.state-file:./data/eps-demo-state.json}") String stateFile) {
        this.mapper = mapper;
        this.stateFile = Path.of(stateFile).toAbsolutePath().normalize();
    }

    @PostConstruct
    public synchronized void load() {
        if (!Files.exists(stateFile)) return;
        try {
            JsonNode saved = mapper.readTree(stateFile.toFile());
            revision = saved.path("revision").asLong(0);
            JsonNode savedData = saved.get("data");
            data = savedData == null || savedData.isNull() ? null : savedData;
        } catch (IOException e) {
            throw new IllegalStateException("Could not read demo state from " + stateFile, e);
        }
    }

    public synchronized ObjectNode read() {
        ObjectNode result = mapper.createObjectNode();
        result.put("revision", revision);
        result.set("data", data == null ? mapper.getNodeFactory().nullNode() : data.deepCopy());
        return result;
    }

    public synchronized ObjectNode write(JsonNode nextData) {
        return write(nextData, null);
    }

    /** Writes a client snapshot only when it was based on the latest revision. */
    public synchronized ObjectNode write(JsonNode nextData, Long expectedRevision) {
        if (nextData == null || !nextData.isObject()) {
            throw new IllegalArgumentException("Demo state must be a JSON object");
        }
        if (expectedRevision != null && expectedRevision != revision) {
            throw new RevisionConflictException();
        }
        if (data != null && data.equals(nextData)) {
            return read();
        }
        data = nextData.deepCopy();
        revision++;
        persist();
        return read();
    }

    /** Applies one server-side workflow update atomically to the shared snapshot. */
    public synchronized ObjectNode update(UnaryOperator<ObjectNode> mutation) {
        ObjectNode next = data != null && data.isObject()
                ? ((ObjectNode) data).deepCopy()
                : mapper.createObjectNode();
        ObjectNode updated = mutation.apply(next);
        if (updated == null) {
            throw new IllegalArgumentException("Demo state update returned no data");
        }
        data = updated;
        revision++;
        persist();
        return read();
    }

    private void persist() {
        Path temporaryFile = stateFile.resolveSibling(stateFile.getFileName() + ".tmp");
        ObjectNode saved = mapper.createObjectNode();
        saved.put("revision", revision);
        saved.set("data", data);
        try {
            Path parent = stateFile.getParent();
            if (parent != null) Files.createDirectories(parent);
            mapper.writerWithDefaultPrettyPrinter().writeValue(temporaryFile.toFile(), saved);
            try {
                Files.move(temporaryFile, stateFile, StandardCopyOption.REPLACE_EXISTING,
                        StandardCopyOption.ATOMIC_MOVE);
            } catch (IOException unsupportedAtomicMove) {
                Files.move(temporaryFile, stateFile, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw new IllegalStateException("Could not save demo state to " + stateFile, e);
        }
    }

    public static final class RevisionConflictException extends RuntimeException {
        private static final long serialVersionUID = 1L;
    }
}
