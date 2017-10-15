import { Scene, PerspectiveCamera, WebGLRenderer, PlaneGeometry,
    MeshLambertMaterial, Mesh, Vector3, PCFSoftShadowMap, AmbientLight,
    SpotLight, SphereGeometry, BoxGeometry, EllipseCurve, TextureLoader,
    SpriteMaterial, DataTexture, RGBAFormat, DirectionalLight, Object3D } from 'three';

import * as schema from './schema';

// World coordinates:
// x, y are [0,width) x [0, height)
// ground is drawn at z=0
// higher z is up

// override three.js defaults to make "up" be in the z direction
Object3D.DefaultUp = new Vector3(0, 0, 1);

// An RGB color for each team
type TeamColors = number[];

/**
 * Draws the game world.
 */
export default class Renderer {
    // we store references to things we'll need to update
    scene: Scene;
    perspective: PerspectiveCamera;
    renderer: WebGLRenderer;

    teamColors: TeamColors;

    entities: Entities;

    constructor(start: schema.GameStart) {
        this.teamColors = makeColors(start.teams);

        // create a scene, that will hold all our elements such as objects, cameras and lights.
        this.scene = new Scene();

        // create a render and set the size
        this.renderer = new WebGLRenderer();
        this.renderer.setClearColor(0xEEEEEE);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = PCFSoftShadowMap;

        // add the tiles to the world
        const tiles = makeTiles(start.map);
        this.scene.add(tiles);

        // add the robots to the world
        this.entities = new Entities(this.scene, this.teamColors);

        const ambient = new AmbientLight("#222");
        this.scene.add(ambient);

        const directional = new DirectionalLight("#fff", 0.5);
        // light shines from this position to 0,0,0
        // we want it mostly above with a slight offset for pretty
        directional.position = new Vector3(.1, .1, 1);
        this.scene.add(directional);

        // create a camera, which defines where we're looking at.
        this.perspective = new PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.perspective.position.x = -10;
        this.perspective.position.y = -10;
        this.perspective.position.z = 5;
        this.perspective.lookAt(new Vector3(start.map.width / 2, start.map.height / 2, 0));
    }

    update(update: schema.NextTurn) {
        for (const changed of update.changed) {
            this.entities.addOrUpdateEntity(changed);
        }
        for (const dead of update.dead) {
            this.entities.deleteEntity(dead);
        }
    }

    render() {
        this.renderer.render(this.scene, this.perspective);
    }

    get domElement() {
        return this.renderer.domElement;
    }

    dispose() {
        this.domElement.remove();
    }
}

const ENTITY_GEOMETRIES = {
    statue: new BoxGeometry(1,1.5,1,1,1,1),
    robot: new BoxGeometry(1,1,1,1,1,1),
    hedge: new BoxGeometry(1,1.5,1,1,1,1)
};

/**
 * All of the entities being rendered
 */
class Entities {
    scene: Scene;
    /**
     * A sparse array indexed by ID.
     */
    entities: (Mesh | undefined)[];
    teamMaterials: MeshLambertMaterial[];

    constructor(scene: Scene, teamColors: TeamColors) {
        this.scene = scene;
        this.teamMaterials = [];
        for (let color of teamColors) {
            this.teamMaterials.push(new MeshLambertMaterial({ color: color }));
        }
    }

    addOrUpdateEntity(data: schema.EntityData) {
        if (this.entities[data.id] === undefined) {
            // honestly this should work but typescript is picky
            const geometry = <BoxGeometry>(<any>ENTITY_GEOMETRIES)[data.type];
            const material = this.teamMaterials[data.team];

            this.entities[data.id] = new Mesh(geometry, material);
        }
        const mesh = this.entities[data.id];
        if (!mesh) {
            console.log("skipping update for: "+data.id);
            return;
        }
        if (data.held_by !== undefined) {
            mesh.position.z = 2.1;
        } else {
            mesh.position.z = 1;
        }
        mesh.position.x = data.location.x;
        mesh.position.y = data.location.y;
    }

    deleteEntity(id: schema.EntityID) {
        const ent = this.entities[id]
        if (ent) {
            this.scene.remove(ent);
            this.entities[id] = undefined;
        }
    }

}

/**
 * Computes colors for teams.
 */
const makeColors = (teams: schema.TeamData[]) => {
    // TODO: handle additional teams
    return [0x888888, 0xee0000, 0x0000ff];
}

/**
 * Creates a mesh for the world's tiles.
 */
const makeTiles = (map: schema.MapData) => {
    const data = new Uint32Array(map.width * map.height);

    for (let x = 0; x < map.width; x++) {
        for (let y = 0; y < map.height; y++) {
            let tile = map.tiles[y][x] == 'G' ?
                0x00ff00ff : 0x777777;
            data[y * map.width + x] = tile;
        }
    }

    const texture = new DataTexture(
        data,
        map.width,
        map.height,
        RGBAFormat
    );
    const material = new MeshLambertMaterial({ color: 0xffffff, map: texture });

    const geom = new PlaneGeometry(map.width, map.height, 1, 1);

    // created at (0,0) by default
    const mesh = new Mesh(geom, material);
    mesh.receiveShadow = true;

    return mesh;
};