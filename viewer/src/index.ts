/// <reference path="./webpack.d.ts" />
// note: above is wacky old declaration syntax used so that we can
// import using webpack loaders

import { Scene, PerspectiveCamera, WebGLRenderer, PlaneGeometry,
    MeshLambertMaterial, Mesh,Vector3, PCFSoftShadowMap, AmbientLight,
    SpotLight, SphereGeometry, BoxGeometry, EllipseCurve, TextureLoader} from 'three';

import LogoImg from './img/Logo.png';

console.log("img: " +LogoImg);

// create a scene, that will hold all our elements such as objects, cameras and lights.
const scene = new Scene();

// create a camera, which defines where we're looking at.
const camera = new PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);


// create a render and set the size
const renderer = new WebGLRenderer();
renderer.setClearColor(0xEEEEEE);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;

// create the ground plane
const planeGeometry = new PlaneGeometry(60, 20, 1, 1);
const planeMaterial = new MeshLambertMaterial({color: 0xffffff});
const plane = new Mesh(planeGeometry, planeMaterial);
plane.receiveShadow = true;

// rotate and position the plane
plane.rotation.x = -0.5 * Math.PI;
plane.position.x = 15;
plane.position.y = 0;
plane.position.z = 0;

// add the plane to the scene
scene.add(plane);

// create a cube
const cubeGeometry = new BoxGeometry(4, 4, 4);
const cubeMaterial = new MeshLambertMaterial({color: 0xff0000});
const cube = new Mesh(cubeGeometry, cubeMaterial);
cube.castShadow = true;

// position the cube
cube.position.x = -4;
cube.position.y = 3;
cube.position.z = 0;

// add the cube to the scene
scene.add(cube);
const sphereGeometry = new SphereGeometry(4, 20, 20);
const sphereMaterial = new MeshLambertMaterial({color: 0x7777ff});
const sphere = new Mesh(sphereGeometry, sphereMaterial);

// position the sphere
sphere.position.x = 20;
sphere.position.y = 0;
sphere.position.z = 2;
sphere.castShadow = true;

// add the sphere to the scene
scene.add(sphere);

// position and point the camera to the center of the scene
camera.position.x = -25;
camera.position.y = 30;
camera.position.z = 25;
camera.lookAt(new Vector3(10, 0, 0));

// add subtle ambient lighting
const ambiColor = "#0c0c0c";
const ambientLight = new AmbientLight(ambiColor);
scene.add(ambientLight);

// add spotlight for the shadows
const spotLight = new SpotLight(0xffffff);
spotLight.position.set(-40, 60, -10);
spotLight.castShadow = true;
scene.add(spotLight);

var textureLoader = new TextureLoader();

//var textureFlare = textureLoader.load(LogoImg);

// add the output of the renderer to the html element
document.body.appendChild(renderer.domElement);

// call the render function
var step = 0;
const controls = {
    rotationSpeed : 0.02,
    bouncingSpeed : 0.03,
    ambientColor : ambiColor,
    disableSpotlight : false
};

function render() {
    // rotate the cube around its axes
    cube.rotation.x += controls.rotationSpeed;
    cube.rotation.y += controls.rotationSpeed;
    cube.rotation.z += controls.rotationSpeed;
    // bounce the sphere up and down
    step += controls.bouncingSpeed;
    sphere.position.x = 20 + ( 10 * (Math.cos(step)));
    sphere.position.y = 2 + ( 10 * Math.abs(Math.sin(step)));
    // render using requestAnimationFrame
    requestAnimationFrame(render);
    renderer.render(scene, camera);
}

render();
