import { Scene, PerspectiveCamera, WebGLRenderer, PlaneGeometry,
    MeshLambertMaterial, Mesh, Vector3, PCFSoftShadowMap, AmbientLight,
    SpotLight, SphereGeometry, BoxGeometry, EllipseCurve, TextureLoader,
    SpriteMaterial, DataTexture, RGBAFormat, DirectionalLight, Object3D,
    OrthographicCamera } from 'three';

import * as THREE from 'three';

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
    gameID: schema.GameID;

    scene: Scene;
    perspective: PerspectiveCamera;
    isometric: OrthographicCamera;
    renderer: WebGLRenderer;

    teamColors: TeamColors;

    entities: Entities;

    map: schema.GameState;

    angle: number;

    constructor(start: schema.GameStart) {
        this.gameID = start.gameID;
        this.teamColors = makeColors(start.teams);
        this.map = start.initialState;

        // create a scene, that will hold all our elements such as objects, cameras and lights.
        this.scene = new Scene();
        (<any>window)['scene'] = this.scene;

        // create a render and set the size
        this.renderer = new WebGLRenderer();
        this.renderer.setClearColor(0xEEEEEE);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.BasicShadowMap;
        // makes picture cleaner but more expensive on retina
        // TODO: conditionally enable? fancy mode?
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // add the tiles to the world
        const tiles = makeTiles(this.map);
        this.scene.add(tiles);

        // add the robots to the world
        this.entities = new Entities(this.scene, this.teamColors);

        for (let entity of this.map.entities) {
            this.entities.addOrUpdateEntity(entity);
        }

        const ambient = new AmbientLight("#fff", .4);
        this.scene.add(ambient);

        // used for sizing cameras
        const mapD = 2 + Math.max(this.map.width, this.map.height) / 2;

        const directional = new DirectionalLight("#fff", 0.5);
        // light shines from this position to 0,0,0
        // we want it mostly above with a slight offset for pretty
        directional.castShadow = true;
        directional.position.x = -1;
        directional.position.y = -.4;
        directional.position.z = 1.1;
        directional.shadow.camera.left = -mapD-2;
        directional.shadow.camera.right = mapD+2;
        directional.shadow.camera.top = mapD+2;
        directional.shadow.camera.bottom = -mapD-2;
        this.scene.add(directional);

        const aspect = window.innerWidth / window.innerHeight;

        // create a camera, which defines where we're looking at.
        this.perspective = new PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.perspective.position.x = -6;
        this.perspective.position.y = -6;
        this.perspective.position.z = 2;
        this.perspective.lookAt(new Vector3(this.map.width / 2, this.map.height / 2, 0));

        this.isometric = new THREE.OrthographicCamera(- mapD * aspect, mapD * aspect, mapD, - mapD, -200, 200);

        this.setAngle(0);
        this.setupMouse();
    }

    mouseRotating: boolean = false;
    mouseRotateStartX?: number;
    mouseRotateStartY?: number;
    mouseRotateStartAngle?: number;
    setupMouse() {
        this.domElement.onmousedown = (e) => {
            if (e.button === 1 || e.button === 2) {
                this.mouseRotating = true;
                this.mouseRotateStartX = e.offsetX;
                this.mouseRotateStartY = e.offsetY;
                this.mouseRotateStartAngle = this.angle;
            }
        };
        this.domElement.onmousemove = (e) => {
            if (this.mouseRotating) {
                this.setAngle(<number>this.mouseRotateStartAngle +
                       (e.offsetX - <number>this.mouseRotateStartX) / 100);
            }
        }
        this.domElement.onmouseup = (e) => {
            if (this.mouseRotating) {
                this.mouseRotating = false;
                this.mouseRotateStartX = undefined;
                this.mouseRotateStartY = undefined;
                this.mouseRotateStartAngle = undefined;
            }
        }
    }

    update(update: schema.NextTurn) {
        if (update.gameID !== this.gameID) {
            return;
        }
        for (const changed of update.changed) {
            this.entities.addOrUpdateEntity(changed);
        }
        for (const dead of update.dead) {
            this.entities.deleteEntity(dead);
        }
    }

    setAngle(angle: number) {
        this.angle = angle;
        const out = 3;
        this.isometric.position.set((this.map.width / 2 - .5) + Math.cos(angle) * out,
                                    (this.map.height / 2 - .5) + Math.sin(angle) * out,
                                    out);
        this.isometric.lookAt(new THREE.Vector3(this.map.width / 2 - .5, this.map.height / 2 - .5, 0));
    }

    render() {
        this.renderer.render(this.scene, this.isometric);
    }

    get domElement() {
        return this.renderer.domElement;
    }

    dispose() {
        this.domElement.remove();
    }
}

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
        this.entities = [];
        this.teamMaterials = [];
        for (let color of teamColors) {
            this.teamMaterials.push(new MeshLambertMaterial({ color: color }));
        }
    }

    addOrUpdateEntity(data: schema.EntityData) {
        let mesh = this.entities[data.id];
        if (!mesh) {
            if (data.type === 'thrower') {
                const geometry = new BoxGeometry(.75,.75,.75, 1,1,1);
                const material = this.teamMaterials[data.teamID];
                mesh = new Mesh(geometry, material);
                mesh.userData.height = .75;
            } else if (data.type === 'statue') {
                const geometry = new BoxGeometry(.75,.75,2, 1,1,1);
                const material = this.teamMaterials[data.teamID];
                mesh = new Mesh(geometry, material);
                mesh.userData.height = 2;
            } else { // if (data.type === 'hedge') {
                const geometry = new BoxGeometry(1,1,1.2, 1,1,1);
                const material = this.teamMaterials[data.teamID];
                mesh = new Mesh(geometry, material);
                mesh.userData.height = 1.2;
            }
            mesh.castShadow = true;
            mesh.userData.entityId = data.id;

            this.entities[data.id] = mesh;
            this.scene.add(mesh);
        }
        if (data.heldBy !== undefined) {
            mesh.position.z = .75 + .1 + mesh.userData.height / 2;
        } else {
            mesh.position.z = mesh.userData.height / 2;
        }
        mesh.position.x = data.location.x;
        mesh.position.y = data.location.y;
        mesh.updateMatrix();
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
    return [0x00a31d, 0xee0000, 0x0000ff];
}

/**
 * Creates a mesh for the world's tiles.
 * 
 * TODO: this is slightly wrong??
 */
const makeTiles = (map: schema.GameState) => {
    const data = new Uint8Array(map.width * map.height * 4);

    for (let x = 0; x < map.width; x++) {
        for (let y = 0; y < map.height; y++) {
            const i = y * map.width * 4 + x * 4;
            if (map.tiles[map.height - 1 - y][x] === 'G') {
                data[i + 0] = 0;
                data[i + 1] = 255;
                data[i + 2] = 0;
                data[i + 3] = 255;
            } else {
                data[i + 0] = 100;
                data[i + 1] = 100;
                data[i + 2] = 100;
                data[i + 3] = 255;
            }
        }
    }

    const texture = new DataTexture(
        data,
        map.width,
        map.height,
        RGBAFormat,
        THREE.UnsignedByteType
    );
    texture.needsUpdate = true;
    const material = new MeshLambertMaterial({ color: 0xffffff, map: texture });

    const geom = new PlaneGeometry(map.width, map.height, 1, 1);

    const mesh = new Mesh(geom, material);
    mesh.receiveShadow = true;

    // tile [0,0]'s center is at the origin
    mesh.position.x = map.width / 2 - .5;
    mesh.position.y = map.height / 2 - .5;

    return mesh;
};
