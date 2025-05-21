import { RateLimitError } from './customErrors';

describe('RateLimitError', () => {
  it('should correctly instantiate with a message', () => {
    const errorMessage = "Test rate limit error message";
    const error = new RateLimitError(errorMessage);

    expect(error).toBeInstanceOf(RateLimitError);
    expect(error).toBeInstanceOf(Error); // Should also be an instance of the base Error class
    expect(error.message).toBe(errorMessage);
  });

  it('should have the correct name property', () => {
    const error = new RateLimitError("Another message");
    expect(error.name).toBe('RateLimitError');
  });

  it('should have a stack trace', () => {
    const error = new RateLimitError("Error with stack");
    expect(error.stack).toBeDefined();
    // The exact content of the stack trace can vary, so just check for its existence
    expect(typeof error.stack).toBe('string');
  });
});
