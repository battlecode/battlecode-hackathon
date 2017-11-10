interface FrameDebounce {
    (): void;
    clear(): void
}

export function frameDebounce(f: () => void): FrameDebounce {
    let called = false;

    let id: number;

    let result: any = () => {
        called = true;
    };
    result.clear = () => {
        cancelAnimationFrame(id);
    }

    let loop = () => {
        if (called) {
            f();
            called = false;
        }
        id = requestAnimationFrame(loop);
    }
    id = requestAnimationFrame(loop);

    return result;
}