"use client";

import { createContext } from "react";

/** Closes the mobile scenarios drawer. Null when the panel is not inside a drawer (the wide layout). */
export const CloseDrawerContext = createContext<(() => void) | null>(null);
