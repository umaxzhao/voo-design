/**
 * Size limits for an imported Agent Skill package (SKILL.md plus its
 * references/, scripts/ and assets/ files).
 *
 * They live in src/shared because the Electron main process enforces them
 * while reading a user-selected directory, and the asar only carries
 * src/shared for main-process imports (see tests/electron_package.test.js).
 */
export const MAX_SKILL_RESOURCE_BYTES = 1024 * 1024;
export const MAX_SKILL_PACKAGE_BYTES = 5 * 1024 * 1024;
export const MAX_SKILL_PACKAGE_FILES = 101;
