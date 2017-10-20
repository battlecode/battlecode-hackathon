import { Location } from './schema';

/** A map from locations to entities */
export default class LocationMap<T> {
    // a sparse array
    // don't worry, the JS engine can handle it :)
    // non-set items will be undefined
    items: T[];

    width: number;
    height: number;

    constructor(width: number, height: number) {
        if (width <= 0 || height <= 0) {
            throw new Error("invalid size: "+width+","+height);
        }
        this.items = Array(width * height);
        this.width = width;
        this.height = height;
    }

    private _validate(x: number, y: number) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
            throw new Error("out of bounds: "+x+","+y+" ["+this.width+","+this.height+"]");
        }
    }

    /**
     * Set a location to a value.
     */
    set(x: number, y: number, v: T) {
        this._validate(x,y);
        const i = y * this.width + x;
        this.items[i] = v;
    }

    /**
     * Set a location to undefined.
     */
    delete(x: number, y: number) {
        this._validate(x,y);
        const i = y * this.width + x;
        delete this.items[i];
    }

    /**
     * Check if a location is not undefined.
     */
    has(x: number, y: number): boolean {
        this._validate(x,y);
        const i = y * this.width + x;
        return this.items[i] !== undefined;
    }

    /**
     * Get the entry stored at a location.
     */
    get(x: number, y: number): T | undefined {
        this._validate(x,y);
        const i = y * this.width + x;
        return this.items[i];
    }

    /**
     * Iterate through the values in the map.
     */
    *values(): IterableIterator<T> {
        for (let i = 0; i < this.width; i++) {
            for (let j = 0; j < this.height; j++) {
                let v = this.get(i,j);
                if (v !== undefined) {
                    yield v;
                }
            }
        }
    }

    /**
     * Iterate through the (set) keys in the map.
     */
    *keys(): IterableIterator<Location> {
        for (let x = 0; x < this.width; x++) {
            for (let y = 0; y < this.height; y++) {
                if (this.items[y * this.width + x] !== undefined) {
                    yield { x: x, y: y};
                }
            }
        }
    }

    /**
     * Iterate through the entries in the map.
     */
    *entries(): IterableIterator<[Location,T]> {
        for (const key of this.keys()) {
            yield [key, <T>this.get(key.x, key.y)];
        }
    }
}

