// The live socket, for the suites. The app listens to its rooms over a
// WebSocket to Supabase Realtime (shared/live.js). The suites answer the
// server's functions themselves, but the socket used to go out to the real
// service: a network nobody here controls, in the middle of checks that are
// timed. This stands in for it, in the browser: every channel asked for is
// joined, every heartbeat is answered, and nothing is ever said on one. To the
// page the socket is live and quiet, which is what the real one was to a test.
//
// The client speaks version 2.0.0 of the protocol: each message a JSON array,
// [join_ref, ref, topic, event, payload], and a reply the same with the event
// "phx_reply". What is not understood is left unanswered.
async function quietSocket(context) {
  await context.routeWebSocket(/supabase\.co/, (socket) => {
    socket.onMessage((message) => {
      if (typeof message !== 'string') return;
      let said = null;
      try { said = JSON.parse(message); } catch { return; }
      if (!Array.isArray(said) || said[1] == null) return;
      const [joined, ref, topic] = said;
      socket.send(JSON.stringify([joined, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: [] } }]));
    });
  });
}

module.exports = { quietSocket };
