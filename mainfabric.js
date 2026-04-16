// <script src="https://cdn.jsdelivr.net/npm/fabric@latest/dist/index.min.js"></script>

var canvas
var body
var cameraOffset = { x: 0, y: 0 }
var center 
var cameraZoom = 1
var MAX_ZOOM = 5
var MIN_ZOOM = 0.1
var SCROLL_SENSITIVITY = 0.0005

var isDragging = false
var dragStart = { x: 0, y: 0 }

var glyphData = []
var animationInfo
var frames = []

var timestampElement
var infoBoxElement
var infoBoxPos = { x: 0, y: 0 }

function clearGlyphData() {
    for (i in glyphData) {
        glyphData[i].alpha = 0
    }
}

function mergeGlyphData(newData) {
        for (glyph of newData) {
            glyphData[glyph.index - 1] = structuredClone(glyph)
        }
}

function matmul(t1, t2) {
    return [
        t1[0]*t2[0]+t1[2]*t2[1],        t1[1]*t2[0]+t1[3]*t2[1],
        t1[0]*t2[2]+t1[2]*t2[3],        t1[1]*t2[2]+t1[3]*t2[3],
        t1[0]*t2[4]+t1[2]*t2[5]+t1[4],  t1[1]*t2[4]+t1[3]*t2[5]+t1[5]
    ]
}

function setRotationAndPosition(glyph, rotation, position) {
    t1 = [
        Math.cos(rotation), -Math.sin(rotation), 
        Math.sin(rotation),  Math.cos(rotation), 
        0, 0
    ]
    t2 = [
        1, 0,
        0, 1, 
        position.x, position.y
    ]
    fabric.util.applyTransformToObject(glyph, matmul(t1,t2))
}


function addGlyphJson(glyphJson, to) {
    let i = glyphJson.index - 1
    let glyphs = []
    switch (glyphJson.type) {
            case "shape":
            glyphData[i] = new fabric.Circle()
            glyphData[i].setPositionByOrigin(glyphJson.position, 'center', 'center')
            glyphData[i].setRadius(glyphJson.shape.radius)
            glyphData[i].fill = glyphJson.color
            glyphData[i].opacity = 0
            break;
            case "composite":
            glyphData[i] = new fabric.Group()
            for(childJson of glyphJson.children) {
                addGlyphJson(childJson, glyphData[i])
            }
            setRotationAndPosition(glyphData[i], glyphJson.rotation, glyphJson.position)
            break;
        }
    glyphData[i].index = glyphJson.index
    to.add(glyphData[i])
}

var bigGroup 
async function getAllDVisionData() {
    res = await fetch('http://localhost:422/allGlyphs')
    data = await res.json()
    bigGroup = new fabric.Group()
    glyphData = [] 
    for (glyphJson of data.glyphData) {
        addGlyphJson(glyphJson, bigGroup)
    }
}

async function getAnimationInfo() {
    res = await fetch('http://localhost:422/startAnimation')
    animationInfo = await res.json()
    clearGlyphData()
}

async function getAnimationData() {
    for (let i = 0; i < animationInfo.numberOfFrames; i++) {
        res = await fetch('http://localhost:422/nextFrame')
        data = await res.json()
        frames.push(data)
    }
}

const observer = new ResizeObserver((entries) => {
    canvas.setDimensions({
        width: body.clientWidth,
        height: body.clientHeight
    });
    center = { x: -body.clientWidth/2, y: -body.clientHeight/2 }
});


function setViewportTransform() {
    canvas.setZoom(cameraZoom)
    canvas.absolutePan(cameraOffset)
}

async function init() {
    body = document.querySelector('body')
    timestampElement = document.querySelector('#timestamp')
    infoBoxElement = document.querySelector('#info-box')

    canvas = new fabric.Canvas("canvas");
    canvas.setDimensions({
        width: body.clientWidth,
        height: body.clientHeight
    });

    center = { x: -body.clientWidth/2, y: -body.clientHeight/2 }
    cameraOffset = { x: -body.clientWidth/2, y: -body.clientHeight/2 }
    observer.observe(body)

    cameraZoom = 1
    MAX_ZOOM = 7
    MIN_ZOOM = 0.01
    SCROLL_SENSITIVITY = 0.0005

    canvas.on('mouse:down', (e) => onPointerDown(e))
    // canvas.on('touchstart', (e) => handleTouch(e, onPointerDown))
    canvas.on('mouse:up', (e) => onPointerUp(e))
    // canvas.on('touchend',  (e) => handleTouch(e, onPointerUp))
    canvas.on('mouse:move', (e) => onPointerMove(e))
    // canvas.on('touchmove', (e) => handleTouch(e, onPointerMove))
    body.addEventListener('wheel', (e) => adjustZoom(e.deltaY*SCROLL_SENSITIVITY))
    body.addEventListener('contextmenu', (e) => handleRightClick(e))

    setViewportTransform()
    await getAllDVisionData()
    await getAnimationInfo()
    await getAnimationData()

    runAnimationOnce(5)
    draw()
}

async function handleRightClick(event) {
    event.preventDefault()
    let eventPos = getEventLocation(event)
    let pos = {x:0,y:0}
    pos.x = ((eventPos.x - center.x) / cameraZoom) - cameraOffset.x + center.x
    pos.y = ((eventPos.y - center.y) / cameraZoom) - cameraOffset.y + center.y
    res = await fetch(`http://localhost:422/inspect?x=${pos.x}&y=${pos.y}`)
    inspectData = await res.json()
    infoBoxPos = pos
    infoBoxElement.innerText = inspectData.path
}

function runAnimationOnce(seconds) {
    let millisecondsPerFrame = seconds * 1000 / animationInfo.numberOfFrames
    let currentFrame = 0
    clearGlyphData()
    var startTime = (new Date()).getTime();

    (function p() {
        applyFrame(currentFrame)
        currentFrame += 1
        if (currentFrame < animationInfo.numberOfFrames)  {
            let currentTime = (new Date()).getTime()
            setTimeout(p, (currentFrame * millisecondsPerFrame) - (currentTime - startTime) )
        } else {
            console.log((new Date()).getTime() - startTime)
        }
    })();

}

function applyFrame(index) {
    timestampElement.innerText = frames[index].timestamp

    for(let glyph of frames[index].glyphData) {
        console.log(glyph.type)
        switch (glyph.type) {
            case "shape": 
                var i = glyph.index - 1
                glyphData[i].setPositionByOrigin(glyph.position, 'center', 'center')
                glyphData[i].setRadius(glyph.shape.radius)
                glyphData[i].opacity = glyph.alpha
                break
            case "composite":
                var i = glyph.index - 1
                setRotationAndPosition(glyphData[i], glyph.rotation, glyph.position)
                console.log(i, glyph)
                break;
        }
    }
}

function draw()
{
    setViewportTransform()

    // let dsInfoBoxPos = {
    //     x:(infoBoxPos.x + cameraOffset.x - center.x) * cameraZoom + center.x,
    //     y:(infoBoxPos.y + cameraOffset.y - center.y) * cameraZoom + center.y
    // }
    // infoBoxElement.style.translate = `${dsInfoBoxPos.x}px ${dsInfoBoxPos.y}px`

    // canvas.width = window.innerWidth
    // canvas.height = window.innerHeight
    // ctx.clearRect(0,0, window.innerWidth, window.innerHeight)

    // // drawLabel(window.innerWidth / 2, window.innerHeight / 2, "TEST", 100, 100)
    
    // // Translate to the canvas centre before zooming - so you'll always zoom on what you're looking directly at
    // ctx.translate( window.innerWidth / 2, window.innerHeight / 2 )
    // ctx.scale(cameraZoom, cameraZoom)
    // ctx.translate( -window.innerWidth / 2 + cameraOffset.x, -window.innerHeight / 2 + cameraOffset.y )
    
    // // drawCircle(0, 0, 150, "#FF0000")
    // // drawCircle(0, 0, 100, "#000")

    // for(let glyph of glyphData) {
    //     switch (glyph.type) {
    //         case "label": drawLabel(glyph.position.x, glyph.position.y, glyph.text, glyph.rotation, glyph.fontSize); break
    //     }
    // }

    // for(let glyph of glyphData) {
    //     switch (glyph.type) {
    //         case "shape": drawCircle(glyph.position.x, glyph.position.y, glyph.shape.radius, glyph.color, glyph.alpha); break
    //         case "pieSlice": drawCircle(glyph.position.x, glyph.position.y, glyph.radius, glyph.color); break
    //     }
    // }
    
    requestAnimationFrame( draw )
}

// Gets the relevant location from a mouse or single touch event
function getEventLocation(e)
{
    if (e.touches && e.touches.length == 1)
    {
        return { x:e.touches[0].clientX, y: e.touches[0].clientY }
    }
    else if (e.clientX && e.clientY)
    {
        return { x: e.clientX, y: e.clientY }        
    }
}

// function drawCircle(x, y, radius, color, alpha)
// {
//     ctx.beginPath();
//     ctx.fillStyle = color
//     ctx.globalAlpha = alpha
//     ctx.arc(x, y, radius, 0, 2 * Math.PI);
//     ctx.fill();
// }

// function rotateAround(x, y, rotation) {
//     ctx.translate(x, y);
//     ctx.rotate(rotation);
//     ctx.translate(-x, -y);
// }

// function drawLabel(x, y, text, rotation, fontSize)
// {
//     let rot = rotation / (Math.PI * 2)
//     fontSize = 100
//     ctx.fillStyle = "#000"
//     ctx.font = `${fontSize}px courier`
//     let size = ctx.measureText(text)
//     let tx = x - (size.width/2)
//     let ty = y - (fontSize/2)
//     if (x < 0 && y < 0) {
//         tx = x - size.width
//         ty = y - fontSize
//     } else if (x > 0 && y < 0) {
//         tx = x
//         ty = y - fontSize
//     } else if (x < 0 && y > 0) {
//         tx = x - size.width
//         ty = y + fontSize
//     } else if (x > 0 && y > 0) {
//         tx = x
//         ty = y + fontSize
//     }
//     // rotateAround(x, y, rotation-(Math.PI/2))
//     ctx.fillText(text, tx, ty, 1000)
//     // rotateAround(x, y, -rotation+(Math.PI/2))
// }

function onPointerDown(e)
{
    if (e.target != undefined) return;
    let mouseEvent = e.e 
    isDragging = true
    dragStart.x = -getEventLocation(mouseEvent).x - cameraOffset.x
    dragStart.y = -getEventLocation(mouseEvent).y - cameraOffset.y
}

function onPointerUp(e)
{
    isDragging = false
    initialPinchDistance = null
    lastZoom = cameraZoom
}

function onPointerMove(e)
{
    if (e.target != undefined) return;
    let mouseEvent = e.e 
    if (isDragging)
    {
        cameraOffset.x = -getEventLocation(mouseEvent).x - dragStart.x
        cameraOffset.y = -getEventLocation(mouseEvent).y - dragStart.y
    }
}

function handleTouch(e, singleTouchHandler)
{
    if ( e.touches.length == 1 )
    {
        singleTouchHandler(e)
    }
    else if (e.type == "touchmove" && e.touches.length == 2)
    {
        isDragging = false
        handlePinch(e)
    }
}

let initialPinchDistance = null
let lastZoom = cameraZoom

function handlePinch(e)
{
    e.preventDefault()
    
    let touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    let touch2 = { x: e.touches[1].clientX, y: e.touches[1].clientY }
    
    // This is distance squared, but no need for an expensive sqrt as it's only used in ratio
    let currentDistance = (touch1.x - touch2.x)**2 + (touch1.y - touch2.y)**2
    
    if (initialPinchDistance == null)
    {
        initialPinchDistance = currentDistance
    }
    else
    {
        adjustZoom( null, currentDistance/initialPinchDistance )
    }
}

function adjustZoom(zoomAmount, zoomFactor)
{
    if (!isDragging)
    {
        if (zoomAmount)
        {
            cameraZoom += zoomAmount
        }
        else if (zoomFactor)
        {
            cameraZoom = zoomFactor*lastZoom
        }
        
        cameraZoom = Math.min( cameraZoom, MAX_ZOOM )
        cameraZoom = Math.max( cameraZoom, MIN_ZOOM )
    }
}