import { Scene, PerspectiveCamera, WebGLRenderer, PlaneGeometry,
    MeshLambertMaterial, Mesh, Vector3, PCFSoftShadowMap, AmbientLight,
    SpotLight, SphereGeometry, BoxGeometry, EllipseCurve, TextureLoader,
    SpriteMaterial, DataTexture, RGBAFormat, DirectionalLight, Object3D,
    OrthographicCamera } from 'three';

import * as Inferno from 'inferno';
import Component from 'inferno-component';

import * as THREE from 'three';
import debounce from 'lodash-es/debounce';

import * as schema from '../schema';
import * as state from '../state';

import {Stats} from './stats';

// World coordinates:
// x, y are [0,width) x [0, height)
// ground is drawn at z=0
// higher z is up

// override three.js defaults to make "up" be in the z direction
Object3D.DefaultUp = new Vector3(0, 0, 1);

// An RGB color for each team
type TeamColors = number[];

export interface RendererProps {
    gameState: state.State;
    addUpdateListener: (cb: () => void) => void;
}
export interface RendererState {
    renderer: Renderer;
    mouseRotating: boolean;
    mouseRotateStartX?: number;
    mouseRotateStartY?: number;
    mouseRotateStartAngle?: number;
    beforeRender: () => void;
    afterRender: () => void;
}
export class RendererComponent extends Component<RendererProps, RendererState> {
    domNode: HTMLDivElement;
    state: RendererState;
    constructor(props: RendererProps) {
        super(props);
        this.state = {
            renderer: new Renderer(props.gameState),
            mouseRotating: false,
            beforeRender: () => {},
            afterRender: () => {}
        }
    }

    render() {
        return <div 
            onmousedown={(e) => {
                if (e.button === 1 || e.button === 2) {
                    this.state.mouseRotating = true;
                    this.state.mouseRotateStartX = e.offsetX;
                    this.state.mouseRotateStartY = e.offsetY;
                    this.state.mouseRotateStartAngle = this.state.renderer.angle;
                    this.redraw();
                }
            }}
            onmousemove={(e) => {
                if (this.state.mouseRotating) {
                    this.state.renderer.setAngle(this.state.mouseRotateStartAngle as number +
                        (e.offsetX - (this.state.mouseRotateStartX as number)) / 100);
                    e.preventDefault();
                    this.redraw();
                }
            }}
            onmouseup={(e) => {
                if (this.state.mouseRotating) {
                    this.state.mouseRotating = false;
                    this.state.mouseRotateStartX = undefined;
                    this.state.mouseRotateStartY = undefined;
                    this.state.mouseRotateStartAngle = undefined;
                    e.preventDefault();
                    this.redraw();
                }
            }}
            ref={(input) => this.domNode = input} >
                <Stats addUpdateListener={this.props.addUpdateListener}
                       onRenderBegin={(cb) => this.state.beforeRender = cb}
                       onRenderEnd={(cb) => this.state.afterRender = cb} />
            </div>
    }

    redraw() {
        this.state.beforeRender();
        this.state.renderer.redraw();
        this.state.afterRender();
    }

    componentDidMount() {
        if (this.state === null) return;
        this.domNode.appendChild(this.state.renderer.domElement);
    }

    componentDidUpdate() {
        if (this.state === null) return;
        this.state.renderer.update(this.props.gameState);
    }
}

/**
 * Draws the game world.
 */
export class Renderer {
    // we store references to things we'll need to update
    gameID: schema.GameID;

    scene: Scene;
    perspective: PerspectiveCamera;
    isometric: OrthographicCamera;
    renderer: WebGLRenderer;

    teamColors: TeamColors;

    entities: Entities;

    map: state.State;

    currentState: state.State;

    angle: number;

    constructor(start: state.State) {
        console.log('start')
        this.gameID = start.gameID;
        this.map = start;
        this.currentState = start;

        // create a scene, that will hold all our elements such as objects, cameras and lights.
        this.scene = new Scene();
        (window as any)['scene'] = this.scene;

        this.updateSize();

        // add the tiles to the world
        const tiles = makeTiles(this.map);
        this.scene.add(tiles);

        // add the robots to the world
        this.entities = new Entities(this.scene);

        this.entities.setEntities(start.entities);

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

        this.setAngle(0);
        this.redraw();
    }

    updateSize() {
        // create a render and set the size
        this.renderer = new WebGLRenderer();
        this.renderer.setClearColor(0xEEEEEE);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.BasicShadowMap;
        // makes picture cleaner but more expensive on retina
        // TODO: conditionally enable? fancy mode?
        this.renderer.setPixelRatio(window.devicePixelRatio);

        const aspect = window.innerWidth / window.innerHeight;

        // create a camera, which defines where we're looking at.
        this.perspective = new PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.perspective.position.x = -6;
        this.perspective.position.y = -6;
        this.perspective.position.z = 2;
        this.perspective.lookAt(new Vector3(this.map.width / 2, this.map.height / 2, 0));
        
        const mapD = 2 + Math.max(this.map.width, this.map.height) / 2;
        this.isometric = new THREE.OrthographicCamera(- mapD * aspect, mapD * aspect, mapD, - mapD, -200, 200);
    }

    get domElement() {
        return this.renderer.domElement;
    }

    update = (state: state.State) => {
        console.log('update')
        if (state.gameID !== this.gameID) {
            return;
        }
        this.currentState = state;
        this.entities.setEntities(state.entities);
        this.redraw();
    }

    setAngle(angle: number) {
        this.angle = angle;
        const out = 3;
        this.isometric.position.set((this.map.width / 2 - .5) + Math.cos(angle) * out,
                                    (this.map.height / 2 - .5) + Math.sin(angle) * out,
                                    out);
        this.isometric.lookAt(new THREE.Vector3(this.map.width / 2 - .5, this.map.height / 2 - .5, 0));
    }

    redraw = debounce(() => {
        this.renderer.render(this.scene, this.isometric);
    }, 0);
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

    constructor(scene: Scene) {
        this.scene = scene;
        this.entities = [];
        this.teamMaterials = [];
        for (let color of TEAM_COLORS) {
            this.teamMaterials.push(new MeshLambertMaterial({ color: color }));
        }
    }

    setEntities(data: schema.EntityData[]) {
        let alive: {[id: number]: boolean} = Object.create(null);
        for (let ent of data) {
            this.addOrUpdateEntity(ent);
            alive[ent.id] = true;
        }
        for (let ent of this.entities) {
            if (ent === undefined) continue;
            if (!alive[ent.userData.entityId]) {
                this.deleteEntity(ent.userData.entityId);
            }
        }
    }

    private addOrUpdateEntity(data: schema.EntityData) {
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
            mesh.receiveShadow = true;
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

    private deleteEntity(id: schema.EntityID) {
        const ent = this.entities[id]
        if (ent) {
            this.scene.remove(ent);
            this.entities[id] = undefined;
        }
    }
}

export const TEAM_COLORS = [0x00a31d, 0xee0000, 0x0000ff, 0xff00ff, 0xeeff00, 0x754a00];

export const setColor = (data: Uint8Array | Uint8ClampedArray,
                         width: number,
                         height: number,
                         x: number,
                         y: number,
                         color: number) => {
    const i = y * width * 4 + x * 4;
    data[i + 0] = (color >> 16) & 0xff;
    data[i + 1] = (color >> 8) & 0xff
    data[i + 2] = (color >> 0) & 0xff
    data[i + 3] = 0xff;
}

export const updateTileBuffer = (data: Uint8Array | Uint8ClampedArray, map: state.State) => {
    for (let x = 0; x < map.width; x++) {
        for (let y = 0; y < map.height; y++) {
            let color;
            if (map.tiles[map.height - 1 - y][x] === 'G') {
                color = 0x00ff00;
            } else {
                color = 0x646464;
            }
            setColor(data, map.width, map.height, x, y, color);
        }
    }
}

/**
 * Creates a mesh for the world's tiles.
 * 
 * TODO: this is slightly wrong??
 */
const makeTiles = (map: state.State) => {
    const data = new Uint8Array(map.width * map.height * 4);

    updateTileBuffer(data, map);

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
