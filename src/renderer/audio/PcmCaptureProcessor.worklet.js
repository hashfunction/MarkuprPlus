class MarkuprPcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.chunkSamples = Math.max(128, options.processorOptions?.chunkSamples || 12000);
    this.chunk = new Float32Array(this.chunkSamples);
    this.writeOffset = 0;
  }

  process(inputs) {
    const samples = inputs[0]?.[0];
    if (!samples) {
      return true;
    }

    let readOffset = 0;
    while (readOffset < samples.length) {
      const copyLength = Math.min(
        samples.length - readOffset,
        this.chunkSamples - this.writeOffset,
      );
      this.chunk.set(samples.subarray(readOffset, readOffset + copyLength), this.writeOffset);
      readOffset += copyLength;
      this.writeOffset += copyLength;

      if (this.writeOffset === this.chunkSamples) {
        const completedChunk = this.chunk;
        this.port.postMessage({
          samples: completedChunk,
          sampleRate,
          timestamp: currentTime * 1000,
        }, [completedChunk.buffer]);
        this.chunk = new Float32Array(this.chunkSamples);
        this.writeOffset = 0;
      }
    }

    return true;
  }
}

registerProcessor('markupr-pcm-capture', MarkuprPcmCaptureProcessor);
