"use client";

import dynamic from "next/dynamic";

// The tutor uses localStorage, timers and a Web Worker, which only exist in the
// browser, so skip server rendering for it.
const FlowTutor = dynamic(() => import("@/components/FlowTutor"), {
  ssr: false,
  loading: () => <p style={{ padding: 24 }}>Loading…</p>,
});

export default function Home() {
  return <FlowTutor />;
}
