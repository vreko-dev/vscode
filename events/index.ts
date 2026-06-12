/**
 * Events module - Local event bus implementation
 * Replaces @vreko/contracts EventBus for thin client architecture
 */

export { VrekoEvent, type VrekoEventPayloads } from "../constants/events";
export { LocalEventBus, type VrekoEventBus } from "./LocalEventBus";
