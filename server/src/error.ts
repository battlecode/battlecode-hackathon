/**
 * Throw this error to indicate that the client did something wrong.
 * We'll try to pass it back to them.
 */
export default class ClientError extends Error {
    constructor(message: string) {
        super(message);
    }
}