// Limites de upload dos formulários — compartilhados entre o cliente
// (validação amigável) e a server action (reforço/backstop).
export const MAX_FILES_PER_FIELD = 10;          // por campo de upload
export const MAX_TOTAL_FILES = 30;              // total na submissão (vários campos)
export const MAX_FILE_MB = 25;                  // por arquivo
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
