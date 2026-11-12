"use client";

import { TextStream } from "@/components/block/text-stream";

const VOCABULARY = [
  "Business data sovereignty",
  "Selective disclosure",
  "Portable reputation",
  "Federated discovery",
];

export function VocabularyStream() {
  return (
    <TextStream
      items={VOCABULARY}
      prefix="What Chainify protects"
      height="320px"
      fontSize="clamp(1.5rem, 4vw, 2.75rem)"
      fontWeight={600}
      className="w-full"
    />
  );
}
