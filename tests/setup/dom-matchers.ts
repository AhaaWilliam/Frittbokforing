/**
 * Registers @testing-library/jest-dom matchers (toBeDisabled, toHaveValue,
 * toHaveAttribute, toHaveTextContent, toBeInTheDocument, etc.) for vitest.
 *
 * Loaded via vitest.config.ts setupFiles. Safe to run in node-environment
 * tests — matchers are only invoked on DOM elements and do nothing if unused.
 */
import '@testing-library/jest-dom/vitest'
