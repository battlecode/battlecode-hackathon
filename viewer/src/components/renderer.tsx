import {
    Scene, PerspectiveCamera, WebGLRenderer, PlaneGeometry,
    MeshLambertMaterial, Mesh, Vector3, PCFSoftShadowMap, AmbientLight,
    SpotLight, SphereGeometry, BoxGeometry, EllipseCurve, TextureLoader,
    SpriteMaterial, DataTexture, RGBAFormat, DirectionalLight, Object3D,
    OrthographicCamera
} from 'three';

import * as Inferno from 'inferno';
import Component from 'inferno-component';

import * as THREE from 'three';
import { frameDebounce } from '../util/framedebounce';

import * as schema from '../schema';
import * as state from '../state';
import { TOP_BAR_HEIGHT } from '../constants';

import { Stats } from './stats';
import { SectorData } from '../schema';
import LocationMap from '../locationmap';

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
    entData?: schema.EntityData | null;
}
export class RendererComponent extends Component<RendererProps, RendererState> {
    domNode: HTMLDivElement;
    state: RendererState;
    constructor(props: RendererProps) {
        super(props);
        this.state = {
            renderer: new Renderer(props.gameState),
            mouseRotating: false,
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
                } else if (e.button === 0) {
                    this.state.renderer.setCamera(this.state.renderer.cameraName === 'isometric' ?
                        'topDown' : 'isometric');
                }
            }}
            onmousemove={(e) => {
                let ent = this.state.renderer.setMouse(e.clientX, e.clientY);
                if (ent) {// && (!this.state.entData || this.state.entData.id !== ent.id)) {
                    this.setState(
                        {
                            renderer: this.state.renderer,
                            mouseRotating: this.state.mouseRotating,
                            mouseRotateStartX: this.state.mouseRotateStartX,
                            mouseRotateStartY: this.state.mouseRotateStartY,
                            mouseRotateStartAngle: this.state.mouseRotateStartAngle,
                            entData: ent
                        }
                    );
                } else if (ent === undefined && this.state.entData) {
                    this.setState(
                        {
                            renderer: this.state.renderer,
                            mouseRotating: this.state.mouseRotating,
                            mouseRotateStartX: this.state.mouseRotateStartX,
                            mouseRotateStartY: this.state.mouseRotateStartY,
                            mouseRotateStartAngle: this.state.mouseRotateStartAngle,
                            entData: null
                        }
                    );
                }
                if (this.state.mouseRotating) {
                    this.state.renderer.setAngle(this.state.mouseRotateStartAngle as number +
                        (e.offsetX - (this.state.mouseRotateStartX as number)) / 100);
                    e.preventDefault();
                }
            }}
            onmouseup={(e) => {
                if (this.state.mouseRotating) {
                    this.state.mouseRotating = false;
                    this.state.mouseRotateStartX = undefined;
                    this.state.mouseRotateStartY = undefined;
                    this.state.mouseRotateStartAngle = undefined;
                    e.preventDefault();
                }
            }}
            ref={(input) => this.domNode = input} >
            <Stats addUpdateListener={this.props.addUpdateListener}
                onRenderBegin={(cb) => this.state.renderer.beforeRender = cb}
                onRenderEnd={(cb) => this.state.renderer.afterRender = cb} />
            {this.drawEntData()}
        </div>
    }

    private drawEntData() {
        if (this.state.entData) {
            let data = this.state.entData as schema.EntityData;
            return <div style={`position: fixed; bottom: 50px;
                left: 50px; border: gray solid 3px; font-family: ourfont; padding: 3px;`}>
                id: {data.id}
                <br/>
                type: {data.type}
                <br/>
                location: {`(${data.location.x},${data.location.y})`}
                <br/>
                hp: {data.hp}
                <br/>
                cooldown: {Math.max((data.cooldownEnd || this.props.gameState.turn) - this.props.gameState.turn, 0)}
            </div>;
        } else {
            return <div />
        }
    }

    componentDidMount() {
        if (this.state === null) return;
        this.domNode.appendChild(this.state.renderer.domElement);
    }

    componentDidUpdate() {
        if (this.state === null) return;
        this.state.renderer.update(this.props.gameState);
        this.state.renderer.updateSize();
        this.state.renderer.redraw();
    }
}

/**
 * Draws the game world.
 */
export class Renderer {
    // we store references to things we'll need to update
    gameID: schema.GameID;

    scene: Scene;
    isometric: OrthographicCamera;
    topDown: OrthographicCamera;
    activeCamera: OrthographicCamera;

    renderer: WebGLRenderer;

    teamColors: TeamColors;

    entities: Entities;

    sectors: Sectors;

    map: state.State;

    currentState: state.State;

    angle: number;

    directional: DirectionalLight;

    beforeRender: () => void;
    afterRender: () => void;

    constructor(start: state.State) {
        this.gameID = start.gameID;
        this.map = start;
        this.currentState = start;
        this.beforeRender = () => { };
        this.afterRender = () => { };

        // create a scene, that will hold all our elements such as objects, cameras and lights.
        this.scene = new Scene();
        (window as any)['scene'] = this.scene;

        this.renderer = new WebGLRenderer();
        this.renderer.setClearColor(0xEEEEEE);
        this.updateSize();
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.BasicShadowMap;

        // add the tiles to the world
        const tiles = makeTiles(this.map);
        this.scene.add(tiles);

        // add the robots to the world
        this.entities = new Entities(this.scene);
        this.entities.setEntities(start.entities);

        this.sectors = new Sectors(this.scene, this.map.width, this.map.height);
        this.sectors.setSectors(start.sectors.values());

        const ambient = new AmbientLight("#fff", .4);
        this.scene.add(ambient);

        // used for sizing cameras
        const mapD = 2 + Math.max(this.map.width, this.map.height) / 2;

        this.directional = new DirectionalLight("#fff", 0.5);
        // light shines from this position to 0,0,0
        // we want it mostly above with a slight offset for pretty
        this.directional.castShadow = true;
        this.directional.position.x = -1;
        this.directional.position.y = -.4;
        this.directional.position.z = 1.1;
        this.directional.shadow.camera.left = -mapD - 2;
        this.directional.shadow.camera.right = mapD + 2;
        this.directional.shadow.camera.top = mapD + 2;
        this.directional.shadow.camera.bottom = -mapD - 2;
        this.directional.shadow.mapSize.height = 1024;
        this.directional.shadow.mapSize.width = 1024;
        this.scene.add(this.directional);

        this.setAngle(5 * Math.PI / 4);

        this.setCamera('isometric');

        this.redraw();
    }

    oldWidth?: number;
    oldHeight?: number;
    updateSize() {
        const width = window.innerWidth;
        const height = window.innerHeight - TOP_BAR_HEIGHT;
        if (this.oldWidth === width && this.oldHeight === height) {
            return;
        }
        this.oldWidth = width;
        this.oldHeight = height;
        // create a render and set the size
        this.renderer.setSize(width, height);
        // makes picture cleaner but more expensive on retina
        // TODO: conditionally enable? fancy mode?
        this.renderer.setPixelRatio(window.devicePixelRatio);

        const aspect = width / height;

        // create a camera, which defines where we're looking at.
        const mapD = 2 + Math.max(this.map.width, this.map.height) / 2;
        this.isometric = new THREE.OrthographicCamera(- mapD * aspect, mapD * aspect, mapD, - mapD, -200, 200);

        this.topDown = new THREE.OrthographicCamera(- mapD * aspect, mapD * aspect, mapD, - mapD, -200, 200);
        this.topDown.position.set(this.map.width / 2, this.map.height / 2, 5);
        this.topDown.up.set(0, 1, 0);
    }

    get domElement() {
        return this.renderer.domElement;
    }

    update(state: state.State) {
        if (state.gameID !== this.gameID) {
            return;
        }
        this.currentState = state;
        this.entities.setEntities(state.entities);
        this.sectors.setSectors(state.sectors.values());
    }

    cameraName: string;
    setCamera(cameraName: 'isometric' | 'topDown') {
        if (this.cameraName === cameraName) {
            return;
        }
        this.activeCamera = this[cameraName];
        this.cameraName = cameraName;
        if (cameraName === 'topDown') {
            this.directional.castShadow = false;
        } else {
            this.directional.castShadow = true;
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

    raycaster = new THREE.Raycaster();
    setMouse(mouseX: number, mouseY: number) {
        // normalize location to what three expects
        let mouse = {
            x: (mouseX / window.innerWidth) * 2 - 1,
            y: - ((mouseY - TOP_BAR_HEIGHT) / (window.innerHeight - TOP_BAR_HEIGHT)) * 2 + 1
        };

        this.raycaster.setFromCamera(mouse, this.activeCamera);

        let isxts = this.raycaster.intersectObjects(this.scene.children);
        isxts = isxts.filter(i => i.object.userData.entityID !== undefined);
        let changed;
        let ent;
        if (isxts.length > 0) {
            ent = this.currentState.entities[isxts[0].object.userData.entityID];
        }
        changed = this.entities.outlineEntity(ent);
        return ent;
    }

    redraw = frameDebounce(() => {
        this.beforeRender();
        this.renderer.render(this.scene, this.activeCamera);
        this.afterRender();
    });
}

class Sectors {
    scene: Scene;
    sectors: LocationMap<Mesh | undefined>;
    geometry: THREE.BufferGeometry;
    materials: THREE.MeshBasicMaterial[];

    constructor(scene: Scene, width: number, height: number) {
        this.scene = scene;
        this.sectors = new LocationMap(Math.ceil(width / 5), Math.ceil(height / 5));
        let g = new THREE.Geometry()
        g.vertices.push(
            new THREE.Vector3( -.5,  -.5, 0 ),
            new THREE.Vector3(5-.5,  -.5, 0 ),
            new THREE.Vector3( -.5, 5-.5, 0 ),
            new THREE.Vector3(5-.5, 5-.5, 0 ),
            new THREE.Vector3( -.5+.01,  -.5+.01, .1),
            new THREE.Vector3(5-.5+.01,  -.5+.01, .1),
            new THREE.Vector3( -.5+.01, 5-.5+.01, .1),
            new THREE.Vector3(5-.5+.01, 5-.5+.01, .1),
            new THREE.Vector3( -.5,  -.5, .01 ),
            new THREE.Vector3(5-.5,  -.5, .01 ),
            new THREE.Vector3( -.5, 5-.5, .01 ),
            new THREE.Vector3(5-.5, 5-.5, .01 ),
        );
        g.faces.push(
            new THREE.Face3(0,1,4),
            new THREE.Face3(4,1,5),
            new THREE.Face3(2,3,6),
            new THREE.Face3(6,3,7),
            new THREE.Face3(0,2,6),
            new THREE.Face3(0,6,4),
            new THREE.Face3(1,3,7),
            new THREE.Face3(1,7,5),
            new THREE.Face3(8,9,10),
            new THREE.Face3(9,10,11),
        );
        this.geometry = new THREE.BufferGeometry().fromGeometry(g);
        this.materials = [];
        for (let col of TEAM_COLORS) {
            this.materials.push(new THREE.MeshBasicMaterial({color: col, transparent: true, opacity: 0.3, side: THREE.DoubleSide}));
        }
    }

    setSectors(sectors: SectorData[]) {
        for (let sector of sectors) {
            let mesh = this.sectors.get(sector.topLeft.x / 5, sector.topLeft.y / 5);

            if (!mesh) {
                mesh = new Mesh(this.geometry, this.materials[0]);
                mesh.position.set(sector.topLeft.x, sector.topLeft.y, 0);
                this.sectors.set(sector.topLeft.x / 5, sector.topLeft.y / 5, mesh);
            }

            if (sector.controllingTeamID === 0) {
                this.scene.remove(mesh);
                continue;
            }

            mesh.material = this.materials[sector.controllingTeamID];
            this.scene.add(mesh);
        }
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
    statueMaterials: MeshLambertMaterial[];
    geometries: { [type: string]: THREE.BufferGeometry };
    outlineMaterial: THREE.LineBasicMaterial;
    outlines: { [type: string]: THREE.Line };
    activeOutline?: THREE.Line;

    constructor(scene: Scene) {
        this.scene = scene;
        this.entities = [];
        this.teamMaterials = [];
        this.statueMaterials = [];
        for (let color of TEAM_COLORS) {
            this.teamMaterials.push(new MeshLambertMaterial({ color: color }));
            this.statueMaterials.push(new MeshLambertMaterial({ color: color, transparent: true, opacity: 0.7 }));
        }
        this.geometries = {
            thrower: new THREE.BoxBufferGeometry(.75, .75, .75, 1, 1, 1).translate(0, 0, .75 / 2),
            statue: new THREE.BoxBufferGeometry(.75, .75, 2, 1, 1, 1).translate(0, 0, 2 / 2),
            hedge: new THREE.BoxBufferGeometry(1, 1, 1.2, 1, 1, 1).translate(0, 0, 1.2 / 2)
        }

        // can you guess how outlines work?
        this.outlineMaterial = new THREE.LineBasicMaterial({
            color: 0xffffff
        });
        this.outlines = {
            thrower: new THREE.Line(new THREE.EdgesGeometry(this.geometries.thrower, .01), this.outlineMaterial),
            statue: new THREE.Line(new THREE.EdgesGeometry(this.geometries.statue, .01), this.outlineMaterial),
            hedge: new THREE.Line(new THREE.EdgesGeometry(this.geometries.hedge, .01), this.outlineMaterial)
        };
        this.outlines.thrower.scale.multiplyScalar(1.02);
        this.outlines.statue.scale.multiplyScalar(1.02);
        this.outlines.hedge.scale.multiplyScalar(1.02);

    }

    setEntities(data: schema.EntityData[]) {
        let alive: { [id: number]: boolean } = Object.create(null);
        for (let ent of data) {
            if (ent === undefined) continue;
            this.addOrUpdateEntity(ent);
            alive[ent.id] = true;
        }
        for (let ent of this.entities) {
            if (ent === undefined) continue;
            if (!alive[ent.userData.entityID]) {
                this.deleteEntity(ent.userData.entityID);
            }
        }
    }

    private addOrUpdateEntity(data: schema.EntityData) {
        let mesh = this.entities[data.id];
        if (!mesh) {
            const geometry = this.geometries[data.type];
            let material;
            if (data.type === 'statue') {
                material = this.statueMaterials[data.teamID];
            } else {
                material = this.teamMaterials[data.teamID];
            }
            mesh = new Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData.entityID = data.id;

            this.entities[data.id] = mesh;
            this.scene.add(mesh);
        }
        this.moveMesh(mesh, data);
        mesh.translateZ(.01);
    }

    private moveMesh(mesh: Object3D, data: schema.EntityData) {
        if (data.heldBy !== undefined) {
            mesh.position.z = .75 + .1;
            mesh.setRotationFromAxisAngle(Object3D.DefaultUp, Math.PI / 4);
        } else {
            mesh.position.z = 0;
            mesh.setRotationFromAxisAngle(Object3D.DefaultUp, 0);
        }
        mesh.position.x = data.location.x;
        mesh.position.y = data.location.y;
    }

    private deleteEntity(id: schema.EntityID) {
        const ent = this.entities[id]
        if (ent) {
            this.scene.remove(ent);
            this.entities[id] = undefined;
        }
    }

    outlineID?: number;
    outlineEntity(data?: schema.EntityData): boolean {
        if (data === undefined && this.outlineID === undefined ||
            data !== undefined && data.id == this.outlineID) {
            return false;
        }
        if (this.activeOutline) {
            this.scene.remove(this.activeOutline);
        }
        if (data) {
            let mesh = this.outlines[data.type];
            this.moveMesh(mesh, data);
            this.scene.add(mesh);
            this.activeOutline = mesh;
            this.outlineID = data.id;
        } else {
            this.outlineID = undefined;
        }
        return true;
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
