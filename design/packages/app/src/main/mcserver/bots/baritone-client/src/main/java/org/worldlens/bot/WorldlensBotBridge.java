package org.worldlens.bot;

import baritone.api.BaritoneAPI;
import baritone.api.pathing.goals.GoalBlock;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.fabricmc.api.ClientModInitializer;
import net.minecraft.client.MinecraftClient;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

/** Private parent-owned stdin control, with no listener or network control port. */
public final class WorldlensBotBridge implements ClientModInitializer {
    private static final String PREFIX = "WORLDLENS_BOT_V1 ";
    private volatile boolean running = true;
    @Override public void onInitializeClient() {
        Thread input = new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
                String line;
                while (running && (line = reader.readLine()) != null) {
                    if (line.length() > 4096) { emit("rejected", "", "Input exceeds limit."); continue; }
                    try {
                        JsonObject request = JsonParser.parseString(line).getAsJsonObject();
                        MinecraftClient.getInstance().execute(() -> apply(request));
                    } catch (Exception ignored) { emit("rejected", "", "Invalid control request."); }
                }
            } catch (Exception ignored) { emit("failed", "", "Control input closed."); }
            running = false;
        }, "worldlens-bot-control");
        input.setDaemon(true); input.start();
        Thread status = new Thread(() -> {
            while (running) {
                MinecraftClient.getInstance().execute(() -> {
                    var client = MinecraftClient.getInstance();
                    if (client.player == null || client.world == null) { emit("starting", "", "Waiting for server world."); return; }
                    JsonObject event = base("status", "", "Server world observed.");
                    event.addProperty("dimension", client.world.getRegistryKey().getValue().toString());
                    event.addProperty("x", client.player.getX()); event.addProperty("y", client.player.getY()); event.addProperty("z", client.player.getZ());
                    event.addProperty("pathing", BaritoneAPI.getProvider().getPrimaryBaritone().getPathingBehavior().isPathing());
                    System.out.println(PREFIX + event);
                });
                try { Thread.sleep(1000); } catch (InterruptedException ignored) { return; }
            }
        }, "worldlens-bot-status");
        status.setDaemon(true); status.start();
    }
    private void apply(JsonObject request) {
        String id = request.has("id") ? request.get("id").getAsString() : "";
        if (id.length() > 80) return;
        try {
            String action = request.get("action").getAsString();
            var client = MinecraftClient.getInstance();
            var baritone = BaritoneAPI.getProvider().getPrimaryBaritone();
            if (action.equals("stop")) { baritone.getPathingBehavior().cancelEverything(); running = false; emit("stopping", id, "Client stop requested."); client.scheduleStop(); return; }
            if (client.player == null || client.world == null) { emit("rejected", id, "Client is not in a world."); return; }
            if (action.equals("cancel")) { baritone.getPathingBehavior().cancelEverything(); emit("cancelled", id, "Navigation cancelled."); return; }
            if (!action.equals("goto")) { emit("rejected", id, "Unknown action."); return; }
            if (!client.world.getRegistryKey().getValue().toString().equals(request.get("dimension").getAsString())) { emit("rejected", id, "Dimension changed."); return; }
            int x = coordinate(request, "x"), y = coordinate(request, "y"), z = coordinate(request, "z");
            if (Math.abs((long)x) > 30000000L || Math.abs((long)z) > 30000000L) throw new IllegalArgumentException();
            baritone.getCustomGoalProcess().setGoalAndPath(new GoalBlock(x, y, z));
            emit("accepted", id, "Baritone navigation submitted.");
        } catch (Exception ignored) { emit("rejected", id, "Invalid navigation request."); }
    }
    private static int coordinate(JsonObject request, String key) {
        double value = request.get(key).getAsDouble();
        if (!Double.isFinite(value) || value != Math.rint(value) || value < Integer.MIN_VALUE || value > Integer.MAX_VALUE) throw new IllegalArgumentException();
        return (int)value;
    }
    private static JsonObject base(String state, String id, String message) { JsonObject event = new JsonObject(); event.addProperty("state", state); event.addProperty("id", id); event.addProperty("message", message); event.addProperty("version", "1.21.4"); event.addProperty("bridgeVersion", "1.0.0"); return event; }
    private static void emit(String state, String id, String message) { System.out.println(PREFIX + base(state, id, message)); }
}
