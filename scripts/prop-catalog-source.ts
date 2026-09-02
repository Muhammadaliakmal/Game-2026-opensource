/**
 * The ~20 props SPEC §11 asks for. One entry here drives one Meshy
 * generation, one optimized catalog GLB, and one card in the editor's prop
 * browser — `id` is the `assetId` that ends up in `PropInstance` and in
 * catalog/R2 file names, so treat it as a stable identifier, not a label.
 */
export interface PropSource {
  id: string;
  name: string;
  prompt: string;
}

export const PROP_SOURCES: PropSource[] = [
  { id: "crate", name: "Wooden Crate", prompt: "a simple wooden shipping crate, low poly game asset" },
  { id: "barrel", name: "Barrel", prompt: "a wooden barrel with metal bands, low poly game asset" },
  { id: "pine-tree", name: "Pine Tree", prompt: "a stylized low poly pine tree" },
  { id: "boulder", name: "Boulder", prompt: "a rounded granite boulder, low poly game asset" },
  { id: "sign-post", name: "Sign Post", prompt: "a wooden signpost with a blank plank, low poly game asset" },
  { id: "bench", name: "Park Bench", prompt: "a simple wooden park bench, low poly game asset" },
  { id: "streetlamp", name: "Streetlamp", prompt: "a cast iron street lamp post, low poly game asset" },
  { id: "potted-plant", name: "Potted Plant", prompt: "a small potted plant with green leaves, low poly game asset" },
  { id: "mailbox", name: "Mailbox", prompt: "a classic post-mounted mailbox, low poly game asset" },
  { id: "fence", name: "Fence Section", prompt: "a short section of wooden picket fence, low poly game asset" },
  { id: "hay-bale", name: "Hay Bale", prompt: "a round bale of hay, low poly game asset" },
  { id: "traffic-cone", name: "Traffic Cone", prompt: "an orange traffic cone, low poly game asset" },
  { id: "picnic-table", name: "Picnic Table", prompt: "a wooden picnic table with attached benches, low poly game asset" },
  { id: "campfire", name: "Campfire", prompt: "a ring of stones around crossed logs, unlit campfire, low poly game asset" },
  { id: "ladder", name: "Ladder", prompt: "a wooden ladder leaning upright, low poly game asset" },
  { id: "flagpole", name: "Flagpole", prompt: "a flagpole with a small flag, low poly game asset" },
  { id: "stone-pillar", name: "Stone Pillar", prompt: "a short round stone pillar, low poly game asset" },
  { id: "mushroom", name: "Giant Mushroom", prompt: "a whimsical oversized red-and-white spotted mushroom, low poly game asset" },
  { id: "treasure-chest", name: "Treasure Chest", prompt: "a closed wooden treasure chest with metal trim, low poly game asset" },
  { id: "bush", name: "Bush", prompt: "a rounded green shrub, low poly game asset" },
];
