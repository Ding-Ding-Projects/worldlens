package org.worldlens.bot;

import com.google.gson.JsonParser;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

/** Receives account-bearing game arguments through the parent's private stdin pipe only. */
public final class ProtectedClientBootstrap {
    public static void main(String[] ignored) {
        try {
            ByteArrayOutputStream firstLine = new ByteArrayOutputStream();
            int next;
            while ((next = System.in.read()) != -1 && next != '\n') {
                if (firstLine.size() >= 65536) throw new IllegalArgumentException();
                firstLine.write(next);
            }
            var request = JsonParser.parseString(firstLine.toString(StandardCharsets.UTF_8)).getAsJsonObject();
            if (!request.get("mainClass").getAsString().equals("net.fabricmc.loader.impl.launch.knot.KnotClient")) throw new IllegalArgumentException();
            var input = request.getAsJsonArray("arguments");
            if (input.size() > 256) throw new IllegalArgumentException();
            String[] arguments = new String[input.size()];
            for (int i = 0; i < input.size(); i++) arguments[i] = input.get(i).getAsString();
            firstLine.reset();
            Class.forName("net.fabricmc.loader.impl.launch.knot.KnotClient").getMethod("main", String[].class).invoke(null, (Object) arguments);
        } catch (Throwable ignoredFailure) {
            // Deliberately omit causes and arguments: authentication must never reach logs.
            System.err.println("Worldlens protected client startup failed.");
            System.exit(1);
        }
    }
}
