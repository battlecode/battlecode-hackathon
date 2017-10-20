import { Location } from '../../viewer/src/schema';
import LocationMap from '../src/locationmap';
import * as test from 'blue-tape';

test('basics', (t) => {
    let map = new LocationMap<string>(10,10);

    map.set(0,0, 'hi');

    t.assert(map.has(0,0));
    t.equal(map.get(0,0), 'hi');

    map.delete(0,0);
    t.assert(!map.has(0,0));
    t.equal(map.get(0,0), undefined);

    t.end();
});

test('invalid', (t) => {
    t.throws(() => {
        new LocationMap<string>(-1, 5);
    });
    t.throws(() => {
        new LocationMap<string>(3,3).set(-1, 2, 'hi');
    });
    t.throws(() => {
        new LocationMap<string>(3,3).set(1, 3, 'hi');
    });
    t.end();
});

test('iterators', (t) => {
    let map = new LocationMap<number>(4,4);
    for (let i = 0; i < 4; i++) {
        map.set(i,i,i);
    }
    let keys = Array.from(map.keys());
    let values = Array.from(map.values());
    let entries = Array.from(map.entries());

    t.equal(keys.length, 4);
    t.equal(values.length, 4);
    t.equal(entries.length, 4);

    for (let i = 0; i < keys.length; i++) {
        t.deepEqual(keys[i], {x: i, y: i});
        t.deepEqual(values[i], i);
        t.deepEqual(keys[i], entries[i][0]);
        t.deepEqual(values[i], entries[i][1]);
    }

    t.end();
})