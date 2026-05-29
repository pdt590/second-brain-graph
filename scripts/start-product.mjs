process.env.SECOND_BRAIN_PRODUCT_MODE = process.env.SECOND_BRAIN_PRODUCT_MODE || '1';
process.env.SECOND_BRAIN_EMBEDDED_HERMES = process.env.SECOND_BRAIN_EMBEDDED_HERMES || '1';

await import('../server/second-brain-server.mjs');
