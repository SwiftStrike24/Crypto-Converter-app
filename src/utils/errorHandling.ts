export function handleApiError(error: unknown): void {
  if (error instanceof Error) {
    console.error('API Error:', error.message);
  } else {
    console.error('Unknown API Error:', error);
  }
} 