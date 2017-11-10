/**
 * lol
 */
export default class Mutex {
    private lock: boolean = false;
    async acquire(): Promise<{release: () => void}> {
        while (this.lock) {
            await new Promise(r => setTimeout(r, 20));
        }
        this.lock = true;
        return {
            release: () => this.lock = false
        }
    }
}