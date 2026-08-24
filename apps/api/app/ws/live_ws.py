"""
WasteWise AI — Live WebSocket Real-Time Connection Manager
Source of truth: loops.md (Loop C) & system_guide.md §1 & security_guide.md §6

Manages full-duplex WebSocket connections and broadcasts real-time route changes,
P0 emergency insertions, and vehicle position telemetry.
"""

import json
from typing import Any, Dict, List

from fastapi import WebSocket


class WebSocketManager:
    def __init__(self):
        # Store active connections
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast_event(self, event_type: str, data: Dict[str, Any]):
        """
        Broadcast a structured real-time JSON payload to all connected surfaces.
        """
        payload = {
            "type": event_type,
            "data": data,
        }
        message_str = json.dumps(payload)
        dead_connections = []

        for connection in self.active_connections:
            try:
                await connection.send_text(message_str)
            except Exception:
                dead_connections.append(connection)

        for dead in dead_connections:
            self.disconnect(dead)


ws_manager = WebSocketManager()
