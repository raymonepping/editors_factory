import { Router } from "express";
import { addClient, removeClient } from "../events.js";

export const eventsRouter = Router();

function streamHandler(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(": connected\n\n");
  addClient(res);
  req.on("close", () => removeClient(res));
}

// Both paths supported per prompts/backend/01_01_orchestrator_api.md.
eventsRouter.get("/events", streamHandler);
eventsRouter.get("/events/stream", streamHandler);
