"use client";

import { createContext, type ReactNode } from "react";

/**
 * The server-rendered first card (see StaticDefaultCard) while the view is still the default one, otherwise null.
 * The live card grid shows it in place of its loading skeleton, so the swap to the live card is in one render.
 */
export const FirstCardContext = createContext<ReactNode>(null);
