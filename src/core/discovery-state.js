// Armado y serializacion puros del estado de discovery. No tocan el fs ni el orden
// de escritura: `packDiscovery` conserva ambos. Los helpers existen para poder pinear
// offline los bytes persistidos sin depender de Repomix.
export const DISCOVERY_STATE_VERSION = 1
export const DISCOVERY_STATE_RULE_VERSION = 2

// Passthrough puro: no ordena, no normaliza y no hashea. El orden de claves es parte
// del contrato de bytes persistidos.
export function buildDiscoveryState({ generatedAt, sources, fileHashes, hash, semantic, packTokens }) {
  return {
    version: DISCOVERY_STATE_VERSION,
    generatedAt,
    sources,
    fileHashes,
    hash,
    ruleVersion: DISCOVERY_STATE_RULE_VERSION,
    semantic,
    packTokens
  }
}

export function renderDiscoveryState(state) {
  return JSON.stringify(state, null, 2) + '\n'
}
