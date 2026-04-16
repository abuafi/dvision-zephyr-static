
var canvas
var animationTimeInput
var ctx
var cameraOffset 
var center 
var cameraZoom = 1
var MAX_ZOOM = 5
var MIN_ZOOM = 0.1
var SCROLL_SENSITIVITY = 0.005

var isDragging = false
var dragStart = { x: 0, y: 0 }

var glyphs = []
var clickables = []
var root = []
var animationInfo
var inspectInfo
var frames = []

var timestampElement
var infoBoxElement
var infoBoxPos = { x: 0, y: 0 }
var viewTransform

function clearGlyphData() {
    for (i in glyphs) {
        glyphs[i].clear()
    }
}

var scrollbar

function setScrollbarFrame(frameNumber) {
    scrollbar.value = frameNumber
}

function addGlyphJson(glyphJson, to, parent = null) {
    let i = glyphJson.index - 1
    let glyph = null
    switch (glyphJson.type) {
            case "shape":
                switch (glyphJson.shape.type) {
                case 'circle':
                    glyph = new Circle()
                    glyph.radius = glyphJson.shape.radius
                break;
                case 'circleSector':
                    glyph = new CircleSector()
                    glyph.innerRadius = glyphJson.shape.innerRadius
                    glyph.outerRadius = glyphJson.shape.outerRadius
                    glyph.startAngle = glyphJson.shape.startAngle
                    glyph.endAngle = glyphJson.shape.endAngle
                break;
                }
                glyph.position = glyphJson.position
                glyph.color = glyphJson.color
                glyph.alpha = glyphJson.alpha
            break;
            case "composite":
            glyph = new Composite()
            glyph.position = glyphJson.position
            glyph.rotation = glyphJson.rotation
            for(childJson of glyphJson.children) {
                addGlyphJson(childJson, glyph.glyphs, glyph)
            }
            break;
            case "label":
            glyph = new Label()
            glyph.position = glyphJson.position
            glyph.rotation = glyphJson.rotation
            glyph.text = glyphJson.text
            glyph.fontSize = glyphJson.fontSize
            glyph.alpha = glyphJson.alpha
            break;
        }
    glyph.parent = parent
    glyph.index = glyphJson.index
    glyphs[i] = glyph
    to.push(glyph)
}

function mergeGlyphData(newData) {
        for (let glyphJson of newData) {
            let glyph = glyphs[glyphJson.index - 1]
            if (glyph == undefined) {
                console.log('Missing index: ', glyphJson.index)
                continue};
            glyph.position = glyphJson.position
            switch (glyphJson.type) {
                case 'shape':
                    glyph.color = glyphJson.color
                    glyph.alpha = glyphJson.alpha
                    switch (glyphJson.shape.type) {
                    case 'circle':
                        glyph.radius = glyphJson.shape.radius
                    break;
                    case 'circleSector':
                        glyph.innerRadius = glyphJson.shape.innerRadius
                        glyph.outerRadius = glyphJson.shape.outerRadius
                        glyph.startAngle = glyphJson.shape.startAngle
                        glyph.endAngle = glyphJson.shape.endAngle
                    break;
                    }
                break
                case 'composite':
                    glyph.rotation = glyphJson.rotation
                break
                case 'label':
                    glyph.text = glyphJson.text
                    glyph.alpha = glyphJson.alpha
                    glyph.anchor = glyphJson.anchor
                break
            }
        }
}

function matmul(t1, t2) {
    return [
        t1[0]*t2[0]+t1[2]*t2[1],        t1[1]*t2[0]+t1[3]*t2[1],
        t1[0]*t2[2]+t1[2]*t2[3],        t1[1]*t2[2]+t1[3]*t2[3],
        t1[0]*t2[4]+t1[2]*t2[5]+t1[4],  t1[1]*t2[4]+t1[3]*t2[5]+t1[5]
    ]
}

function getTransform(rotation, position) {
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
    return matmul(t1,t2)
}

function getViewBox(glyphs) {
    let minx = Math.min(...glyphs.map(g => g.minx())) - 50
    let maxx = Math.max(...glyphs.map(g => g.maxx())) + 50
    let miny = Math.min(...glyphs.map(g => g.miny())) - 50
    let maxy = Math.max(...glyphs.map(g => g.maxy())) + 50
    let width = maxx - minx;
    let height = maxy - miny;
    return `${minx} ${miny} ${width} ${height}`;
}

function glyphsToSvg(glyphs, viewBox = null) {
    
    if (viewBox == null) viewBox = getViewBox(glyphs)
    let svgContent = '';
    
    for (let glyph of glyphs) {
        let glyphSvg = glyph.drawSVG();
        if (glyphSvg) {
            svgContent += glyphSvg + '\n';
        }
    }

    let split = viewBox.split(' ')
    let minx = split[0]
    let miny = split[1]
    let width = split[2]
    let height = split[3]
    
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">
<rect x="${minx}" y="${miny}" width="${width}" height="${height}" fill="#FFFFFF" />
${svgContent}</svg>`;
    
    return svg;
}

class Glyph {
    parent;
    position;
    rotation;
    index;
    anchorOffset;
    ancor;
    transform() {
        let transform = getTransform(this.rotation, this.position)
        if (this.parent == null) return transform;
        else return matmul(this.parent.transform(), transform)
    }
    constructor() {
        this.position = {x:0, y:0};
        this.rotation = 0;
        this.index = 0;
        this.anchor = 'CENTER'
        this.anchorOffset = {x:0, y:0};
    }
    draw() {
        this.setAnchorOffset()
    }
    globalPosition() {
        let t = this.transform();
        return {x: t[4], y: t[5]}
    }
    clear() {}
    setAnchorOffset() {}
    minx() { return this.globalPosition().x }
    maxx() { return this.globalPosition().x }
    miny() { return this.globalPosition().y }
    maxy() { return this.globalPosition().y }
}

class Shape extends Glyph {
    color;
    alpha;
    constructor() {
        super()
        this.alpha = 1;
        this.color = '#000000'
    }
    clear() {
        this.alpha = 0
    }
}

class Circle extends Shape {
    radius;
    constructor() {
        super()
        this.radius = 10
    }

    draw()
    {
        if (this.alpha == 0) return;
        super.draw()
        ctx.beginPath();
        ctx.fillStyle = this.color
        ctx.globalAlpha = this.alpha
        let t = this.transform()
        ctx.setTransform(viewTransform)
        ctx.transform(t[0], t[1], t[2], t[3], t[4], t[5])
        ctx.arc(0, 0, this.radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.globalAlpha = 1
    }

    drawSVG() {
        if (this.alpha == 0) return '';
        
        const t = this.transform();
        const matrix = `${t[0]} ${t[1]} ${t[2]} ${t[3]} ${t[4]} ${t[5]}`;
        const opacity = this.alpha < 1 ? ` opacity="${this.alpha}"` : '';
        
        return `<circle cx="0" cy="0" r="${this.radius}" fill="${this.color}"${opacity} transform="matrix(${matrix})"/>`;
    }

    minx() { return this.globalPosition().x - this.radius }
    maxx() { return this.globalPosition().x + this.radius }
    miny() { return this.globalPosition().y - this.radius }
    maxy() { return this.globalPosition().y + this.radius }

}

class CircleSector extends Shape {
    innerRadius;
    outerRadius;
    startAngle;
    endAngle;

    constructor() {
        super()
        this.innerRadius = 0
        this.outerRadius = 10
        this.startAngle = 0
        this.endAngle = Math.PI
    }
    draw()
    {
        if (this.alpha == 0) return;
        // if (Math.abs(this.startAngle - this.endAngle) < 0.025) return
        super.draw()
        ctx.beginPath();
        let t = this.transform()
        ctx.setTransform(viewTransform)
        ctx.transform(t[0], t[1], t[2], t[3], t[4], t[5])
        ctx.arc(0, 0, this.innerRadius, this.startAngle, this.endAngle); 
        ctx.save();
        ctx.rotate(this.endAngle); 
        ctx.lineTo(this.outerRadius, 0);
        ctx.restore();
        ctx.arc(0, 0, this.outerRadius, this.endAngle, this.startAngle, true);
        ctx.closePath();
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.alpha;
        ctx.fill();
        ctx.globalAlpha = 1
    }

    drawSVG() {
        if (this.alpha == 0) return '';
        
        let t = this.transform();
        let transformMatrix = `matrix(${t[0]},${t[1]},${t[2]},${t[3]},${t[4]},${t[5]})`;
        
        // Calculate path data for the sector
        const pathData = this.createSectorPath();
        
        const svg = `<path d="${pathData}" fill="${this.color}" opacity="${this.alpha}" transform="${transformMatrix}" />`;
        
        return svg;
    }

    createSectorPath() {
        // Convert angles for SVG (SVG angles go clockwise from 3 o'clock, canvas angles go counter-clockwise from 3 o'clock)
        const startX = Math.cos(this.startAngle) * this.outerRadius;
        const startY = Math.sin(this.startAngle) * this.outerRadius;
        const endX = Math.cos(this.endAngle) * this.outerRadius;
        const endY = Math.sin(this.endAngle) * this.outerRadius;
        
        const innerStartX = Math.cos(this.startAngle) * this.innerRadius;
        const innerStartY = Math.sin(this.startAngle) * this.innerRadius;
        const innerEndX = Math.cos(this.endAngle) * this.innerRadius;
        const innerEndY = Math.sin(this.endAngle) * this.innerRadius;
        
        // Determine if arc is large (> 180 degrees)
        const angleDiff = this.endAngle - this.startAngle;
        const largeArcFlag = angleDiff > Math.PI ? 1 : 0;
        
        // Build path: move to outer start, arc to outer end, line to inner end, arc back to inner start, close
        let path = `M ${startX} ${startY}`;
        path += ` A ${this.outerRadius} ${this.outerRadius} 0 ${largeArcFlag} 1 ${endX} ${endY}`;
        path += ` L ${innerEndX} ${innerEndY}`;
        path += ` A ${this.innerRadius} ${this.innerRadius} 0 ${largeArcFlag} 0 ${innerStartX} ${innerStartY}`;
        path += ` Z`;
        
        return path;
    }

}

class Composite extends Glyph {
    glyphs;
    constructor() {
        super()
        this.glyphs = []
    }

    draw() {
        super.draw()
        for (let glyph of this.glyphs) {
            glyph.draw()
        }
    }

    clear() {
        for (let glyph of this.glyphs) {
            glyph.clear()
        }
    }

    drawSVG() {
        let svgContent = '';
        for (let glyph of this.glyphs) {
            let glyphSvg = glyph.drawSVG();
            if (glyphSvg) svgContent += glyphSvg + '\n';
        }
        return svgContent
    }

    minx() { return Math.min(...this.glyphs.map(g => g.minx())) }
    maxx() { return Math.max(...this.glyphs.map(g => g.maxx())) }
    miny() { return Math.min(...this.glyphs.map(g => g.miny())) }
    maxy() { return Math.max(...this.glyphs.map(g => g.maxy())) }
}

class Label extends Glyph {
    text;
    fontSize;
    alpha;
    constructor() {
        super()
        this.text = ''
        this.fontSize = 100
        this.alpha = 1
    }

    clear() {
        this.alpha = 0
    }

    draw() {
        if (this.alpha == 0) return;
        ctx.fillStyle = "#000"
        ctx.font = `${this.fontSize}px courier`
        super.draw()
        
        let t = this.transform()
        ctx.globalAlpha = this.alpha
        ctx.setTransform(viewTransform)
        ctx.transform(1, 0, 0, 1, t[4], t[5])
        ctx.fillText(this.text, this.anchorOffset.x, this.anchorOffset.y)
        ctx.globalAlpha = 1
    }

    setAnchorOffset() {
        ctx.font = `${this.fontSize}px courier`
        let size = ctx.measureText(this.text)
        let w = - size.width
        let h = this.fontSize / 2
        switch (this.anchor) {
            case 'BOTTOM_LEFT':
            this.anchorOffset.x = 0
            this.anchorOffset.y = 0
            break;
            case 'BOTTOM_RIGHT':
            this.anchorOffset.x = w
            this.anchorOffset.y = 0
            break;
            case 'TOP_LEFT':
            this.anchorOffset.x = 0
            this.anchorOffset.y = h
            break;
            case 'TOP_RIGHT':
            this.anchorOffset.x = w
            this.anchorOffset.y = h
            break;
            case 'LEFT':
            this.anchorOffset.x = 0
            this.anchorOffset.y = h / 2
            break;
            case 'RIGHT':
            this.anchorOffset.x = w
            this.anchorOffset.y = h / 2
            break;
            case 'TOP':
            this.anchorOffset.x = w / 2
            this.anchorOffset.y = h
            break;
            case 'BOTTOM':
            this.anchorOffset.x = w / 2
            this.anchorOffset.y = 0
            break;
            case 'CENTER':
            this.anchorOffset.x = w / 2
            this.anchorOffset.y = h / 2
            break;
        }
    }

    drawSVG() {
        if (this.alpha == 0) return '';
        
        this.setAnchorOffset();
        
        let t = this.transform();
        let translateX = t[4] + this.anchorOffset.x;
        let translateY = t[5] + this.anchorOffset.y;

        // Calculate text-anchor based on anchor position
        let textAnchor = 'start';
        // if (this.anchor.includes('RIGHT') || this.anchor === 'RIGHT') {
        //     textAnchor = 'end';
        // }
        // } else if (this.anchor.includes('CENTER') || this.anchor === 'TOP' || this.anchor === 'BOTTOM') {
        //     textAnchor = 'middle';
        // }
        
        // Calculate dominant-baseline for vertical alignment
        let dominantBaseline = 'text-after-edge';
        // if (this.anchor.includes('TOP') || this.anchor === 'TOP') {
        //     dominantBaseline = 'text-before-edge';
        // } else if (this.anchor.includes('BOTTOM') || this.anchor === 'BOTTOM') {
        //     dominantBaseline = 'text-after-edge';
        // }
        
        // Escape XML special characters in text
        const escapedText = this.text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
        
        return `<text x="${translateX}" y="${translateY}" font-size="${this.fontSize}" font-family="courier" fill="${this.color}" opacity="${this.alpha}" text-anchor="${textAnchor}" dominant-baseline="${dominantBaseline}">${escapedText}</text>`;

    }

}

async function getAllDVisionData() {
    let res = await fetch('data/dvision-all-data.json')
    let data = await res.json()
    for (let glyphJson of data.glyphData) {
        addGlyphJson(glyphJson, root)
    }
}

async function getAnimationInfo() {
    let res = await fetch('data/dvision-animation-data.json')
    animationInfo = await res.json()
    clearGlyphData()
}

async function getAnimationData() {
    await getAnimationInfo()
    let res = await fetch(`data/dvision-frame-data.jsonl`)
    let text = await res.text()
    let lines = text.trim().split('\n')
    for (let line of lines) {
        if (line.trim()) { 
            let data = JSON.parse(line)
            frames.push(data)
        }
    }
}

function addModelToGlyph(model, definition, index) {
    if (!inspectInfo[index - 1]) {
        inspectInfo[index - 1] = {}
    }
    inspectInfo[index - 1][definition] = model
}

function addVisualElementToInfo(visualElement) {
    for (let glyphIndex of visualElement.glyphIndices) {
        addModelToGlyph(visualElement.model, visualElement.definition, glyphIndex)
    }
}

async function getAllInfoData() {
    let res = await fetch('data/dvision-info-data.json')
    let data = await res.json()
    inspectInfo = []
    for (let visualElement of data.visualInfo) {
        addVisualElementToInfo(visualElement)
    }
}

const observer = new ResizeObserver((entries) => {
  center = { x: canvas.clientWidth/2, y: canvas.clientHeight/2 }
});

const MILLISECONDS_PER_YEAR = 31556952000
function animationTime() {
    const start = Date.parse(animationInfo.startTime)
    const end = Date.parse(animationInfo.endTime)
    const durationYears = (end - start) / MILLISECONDS_PER_YEAR
    return animationTimeInput.value * durationYears
}

async function init() { 
    timestampElement = document.querySelector('#timestamp')
    infoBoxElement = document.querySelector('#info-box')
    animationTimeInput = document.getElementById("animation-time-per-year")
    animationTimeInput.value = 1

    await Promise.all([
    getAllDVisionData(),
    getAnimationData(),
    getAllInfoData()
    ]);

    canvas = document.getElementById("canvas")

    initScrollbar()

    clickables = glyphs.filter(x => x instanceof Circle)

    ctx = canvas.getContext('2d')

    center = { x: canvas.clientWidth/2, y: canvas.clientHeight/2 }
    cameraOffset = { x: canvas.clientWidth/2, y: canvas.clientHeight/2 }
    observer.observe(canvas)

    cameraZoom = 1
    MAX_ZOOM = 7
    MIN_ZOOM = 0.01
    SCROLL_SENSITIVITY = 0.0005

    canvas.addEventListener('mousedown', onPointerDown)
    canvas.addEventListener('touchstart', (e) => handleTouch(e, onPointerDown))
    canvas.addEventListener('mouseup', onPointerUp)
    canvas.addEventListener('touchend',  (e) => handleTouch(e, onPointerUp))
    canvas.addEventListener('mousemove', onPointerMove)
    canvas.addEventListener('touchmove', (e) => handleTouch(e, onPointerMove))
    canvas.addEventListener('wheel', (e) => adjustZoom(e.deltaY*SCROLL_SENSITIVITY))
    canvas.addEventListener('contextmenu', (e) => handleRightClick(e))

    clearGlyphData()
    runAnimationOnce(animationTime())
    draw()
}

function squaredDistance(p1, p2) {
    return (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2
}

async function handleRightClick(event) {
    event.preventDefault()
    let eventPos = getEventLocation(event)
    let pos = {x:0,y:0}
    pos.x = ((eventPos.x - center.x) / cameraZoom) - cameraOffset.x + center.x
    pos.y = ((eventPos.y - center.y) / cameraZoom) - cameraOffset.y + center.y
    // res = await fetch(`http://localhost:422/inspect?x=${pos.x}&y=${pos.y}`)
    // inspectData = await res.json()
    
    let min = clickables[0]
    let minDistance = squaredDistance(min.globalPosition(), pos)
    for (let glyph of clickables) {
        let distance = squaredDistance(glyph.globalPosition(), pos)
        if (distance < minDistance) {
            min = glyph
            minDistance = distance
        } 
    }
    infoBoxPos = min.globalPosition()
    infoBoxPos.x += min.radius
    infoBoxPos.y += min.radius

    let info = inspectInfo[min.index - 1]
    createInfoBox(infoBoxElement, info)

    
}

function applyUpToFrame(frameNumber) {
    clearGlyphData()
    currentFrame = 0
    animationIsRunning = false

    function p() {
        applyFrame(currentFrame)
        currentFrame += 1
        
        if (currentFrame < frameNumber)  {
            p()
        }
    }

    p()
}

var animationIsRunning = false
var currentFrame = 0
function runAnimationOnce(seconds) {

    if (currentFrame == animationInfo.numberOfFrames) {
        clearGlyphData()
        currentFrame = 0
        setScrollbarFrame(currentFrame)
    }
    var startingFrame = currentFrame
    var durationRatio = (animationInfo.numberOfFrames - startingFrame) / animationInfo.numberOfFrames
    let millisecondsPerFrame = seconds * 1000 * durationRatio / (animationInfo.numberOfFrames - startingFrame)
    console.log(animationInfo.numberOfFrames - startingFrame)
    
    var startTime = (new Date()).getTime();

    animationIsRunning = true;

    (function p() {
        if (!animationIsRunning) return

        applyFrame(currentFrame)
        setScrollbarFrame(currentFrame)
        currentFrame += 1

        if (currentFrame < animationInfo.numberOfFrames)  {
            let currentTime = (new Date()).getTime()
            setTimeout(p, ((currentFrame - startingFrame) * millisecondsPerFrame) - (currentTime - startTime) )
        } else {
            console.log((new Date()).getTime() - startTime)
            animationIsRunning = false
        }
    })();
}

function applyFrame(index) {
    timestampElement.innerText = frames[index].timestamp
    mergeGlyphData(frames[index].glyphData)
}

function draw()
{
    let dsInfoBoxPos = {
        x:(infoBoxPos.x + cameraOffset.x - center.x) * cameraZoom + center.x,
        y:(infoBoxPos.y + cameraOffset.y - center.y) * cameraZoom + center.y
    }
    infoBoxElement.style.translate = `${dsInfoBoxPos.x}px ${dsInfoBoxPos.y}px`

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    ctx.clearRect(0,0, window.innerWidth, window.innerHeight)
    
    // Translate to the canvas centre before zooming - so you'll always zoom on what you're looking directly at
    ctx.translate( window.innerWidth / 2, window.innerHeight / 2 )
    ctx.scale(cameraZoom, cameraZoom)
    ctx.translate( -window.innerWidth / 2 + cameraOffset.x, -window.innerHeight / 2 + cameraOffset.y )
    viewTransform = ctx.getTransform()

    for(let glyph of root) {
        glyph.draw()
    }
    
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

function onPointerDown(e)
{
    isDragging = true
    dragStart.x = getEventLocation(e).x/cameraZoom - cameraOffset.x
    dragStart.y = getEventLocation(e).y/cameraZoom - cameraOffset.y
}

function onPointerUp(e)
{
    isDragging = false
    initialPinchDistance = null
    lastZoom = cameraZoom
}

function onPointerMove(e)
{
    if (isDragging)
    {
        cameraOffset.x = getEventLocation(e).x/cameraZoom - dragStart.x
        cameraOffset.y = getEventLocation(e).y/cameraZoom - dragStart.y
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

function onStartAnimation() {
    if (animationIsRunning) {
        animationIsRunning = false
    } else {
        runAnimationOnce(animationTime())
    }
}

function initScrollbar() {
    // Get the scrollbar element
    scrollbar = document.getElementById('scrollbar');
    scrollbar.max = animationInfo.numberOfFrames

    // Define the callback function that runs when the scrollbar updates
    function onScrollbarChange(value) {
        applyUpToFrame(value)
    }

    // Add event listeners for scrollbar changes
    scrollbar.addEventListener('input', function() {
        onScrollbarChange(this.value);
    });

    scrollbar.addEventListener('change', function() {
        onScrollbarChange(this.value);
    });
}

function saveFile(filename, file) {
    var a = document.createElement("a"),
    url = URL.createObjectURL(file);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function() {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);  
    }, 0); 
}

function exportFrame() {
    const data = glyphsToSvg(root)
    const filename = 'dvision-frame.svg'
    // https://stackoverflow.com/questions/13405129/create-and-save-a-file-with-javascript
    var file = new Blob([data], {type: 'image/svg+xml'});
    if (window.navigator.msSaveOrOpenBlob) // IE10+
        window.navigator.msSaveOrOpenBlob(file, filename);
    else { // Others
        saveFile(filename, file)
    }
}

function exportAllFrames() {
    const confirmed = confirm(`You are about to download all frames as a zip file.
        Warning: It might take some time for the download to appear.`)
    if (!confirmed) return
    const zip = new JSZip();

    clearGlyphData()
    currentFrame = 0
    animationIsRunning = false

    function p() {
        
        applyFrame(currentFrame)
        setScrollbarFrame(currentFrame)
        
        const filename = `dvision-frame-${currentFrame}.svg`
        const content = glyphsToSvg(root)
        zip.file(filename, content);
        
        currentFrame += 1
        
        if (currentFrame < animationInfo.numberOfFrames)  {
            p()
        } else {
            zip.generateAsync({ type: 'blob' }).then(blob => {
                saveFile('dvision-frames.zip', blob)
            });
            console.log(zip)
        }
    }

    p()

}
