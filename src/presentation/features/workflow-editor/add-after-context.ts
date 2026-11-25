import { createContext } from 'react';

/** Opens the add-connected-node menu for an output handle (the + stub after a node). */
export type AddAfterHandler = (nodeId: string, handleId: string, anchor: DOMRect) => void;

export const AddAfterContext = createContext<AddAfterHandler | null>(null);
