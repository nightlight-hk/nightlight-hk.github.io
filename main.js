const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const drawBtn = document.getElementById('drawBtn');
const eraseBtn = document.getElementById('eraseBtn');
const laserBtn = document.getElementById('laserBtn');
let lasers = [];
let laserStartPoint = null;
const LASER_SPEED = 20; // pixel per frame
const LASER_MAX_BOUNCES = 20;

// Set canvas size
canvas.width = 800;
canvas.height = 600;

// App states
let currentMode = 'draw';
let isDrawing = false;
let lines = [];
let tempStartPoint = null;

// Initialize canvas
ctx.strokeStyle = 'white';
ctx.lineWidth = 2;

// Event Listeners
canvas.addEventListener('mousedown', handleCanvasClick);
drawBtn.addEventListener('click', () => switchMode('draw'));
eraseBtn.addEventListener('click', () => switchMode('erase'));
laserBtn.addEventListener('click', () => switchMode('laser'));

function switchMode(mode) {
    currentMode = mode;
    tempStartPoint = null; // Reset temp point when switching modes
    drawBtn.classList.toggle('active', mode === 'draw');
    eraseBtn.classList.toggle('active', mode === 'erase');
    laserBtn.classList.toggle('active', mode === 'laser');
}

function getLineNormal(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    return { 
        // correct ray direction
        x: dy / length, 
        y: -dx / length 
    };
}

function reflectVector(vec, normal) {
    const dot = vec.x * normal.x + vec.y * normal.y;
    const newX = vec.x - 2 * dot * normal.x;
    const newY = vec.y - 2 * dot * normal.y;
    const length = Math.sqrt(newX * newX + newY * newY);
    return { x: newX / length, y: newY / length }; // vector unit
}

function getLineIntersection(rayStart, rayDir, lineStart, lineEnd) {
    // Use vector
    const v1 = {
        x: rayStart.x - lineStart.x,
        y: rayStart.y - lineStart.y
    };
    const v2 = {
        x: lineEnd.x - lineStart.x,
        y: lineEnd.y - lineStart.y
    };
    const v3 = {
        x: -rayDir.y,
        y: rayDir.x
    };

    const dot = v2.x * v3.x + v2.y * v3.y;
    if (Math.abs(dot) < 0.000001) return null;

    const t1 = (v2.x * v1.y - v2.y * v1.x) / dot;
    const t2 = (v1.x * v3.x + v1.y * v3.y) / dot;

    if (t1 >= 0 && t2 >= 0 && t2 <= 1) {
        return {
            x: rayStart.x + rayDir.x * t1,
            y: rayStart.y + rayDir.y * t1
        };
    }
    return null;
}


function isPointOnLine(px, py, start, end, threshold = 5) {
    // Calculate distance from point to line
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const dot = ((px - start.x) * dx + (py - start.y) * dy) / (length * length);
    const closestX = start.x + dot * dx;
    const closestY = start.y + dot * dy;
    const dist = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
    return dist <= threshold;
}


function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw lines
    lines.forEach(line => {
        if (!line.erased) {
            ctx.beginPath();
            ctx.moveTo(line.start.x, line.start.y);
            ctx.lineTo(line.end.x, line.end.y);
            ctx.stroke();
        }
    });
    
    // Draw rays
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    lasers.forEach(laser => {
        if (laser.path.length < 2) return;
        
        ctx.beginPath();
        ctx.moveTo(laser.path[0].x, laser.path[0].y);
        for (let i = 1; i < laser.path.length; i++) {
            const prev = laser.path[i-1];
            const curr = laser.path[i];
            // midpoint
            // smoother route
            const midX = (prev.x + curr.x) / 2;
            const midY = (prev.y + curr.y) / 2;
            ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
        }
        ctx.stroke();
    });
    ctx.restore();
}

function animateLasers() {
    const now = Date.now();
    
    lasers = lasers.filter(laser => now - laser.createTime < 1000);
    
    lasers.forEach(laser => {
        let remainingDistance = laser.speed;
        let safetyCounter = 10;
        
        while (remainingDistance > 0 && safetyCounter-- > 0) {
            const collision = checkLineCollision(laser, remainingDistance);
            
            if (collision && laser.bounces < LASER_MAX_BOUNCES) {
                // distance to collision point
                const dx = collision.point.x - laser.position.x;
                const dy = collision.point.y - laser.position.y;
                const actualDistance = Math.sqrt(dx*dx + dy*dy);
                
                remainingDistance -= actualDistance;
                laser.position = collision.point;
                laser.direction = collision.direction;
                laser.bounces++;
                laser.path.push({...laser.position});
            } 
            else {
                // edge collision
                let newX = laser.position.x + laser.direction.x * remainingDistance;
                let newY = laser.position.y + laser.direction.y * remainingDistance;
                
                let bounced = false;
                if (newX < 0 || newX > canvas.width) {
                    laser.direction.x *= -1;
                    bounced = true;
                }
                if (newY < 0 || newY > canvas.height) {
                    laser.direction.y *= -1;
                    bounced = true;
                }
                
                if (bounced) {
                    laser.bounces++;
                    laser.path.push({...laser.position});
                    // Prevent going out
                    newX = Math.max(0, Math.min(canvas.width, newX));
                    newY = Math.max(0, Math.min(canvas.height, newY));
                }
                
                laser.position.x = newX;
                laser.position.y = newY;
                remainingDistance = 0;
            }
        }
        
        laser.path.push({...laser.position});
    });
    
    redrawCanvas();
    if (lasers.length > 0) requestAnimationFrame(animateLasers);
}

function handleCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (currentMode === 'laser') {
        if (!laserStartPoint) {
            // first click
            laserStartPoint = { x, y };
        } 
        else {
            // calculate direction at 2nd click
            const dx = x - laserStartPoint.x;
            const dy = y - laserStartPoint.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const direction = {
                x: dx / length,
                y: dy / length
            };
            
            lasers.push({
                position: { ...laserStartPoint },
                direction,
                speed: LASER_SPEED,
                createTime: Date.now(),
                path: [laserStartPoint],
                bounces: 0
            });
            
            laserStartPoint = null;
            animateLasers();
        }
    }
    else if (currentMode === 'draw') {
        if (!tempStartPoint) {
            // if no start point yet
            tempStartPoint = { x, y };
        } 
        else {
            // Create line and reset temp point
            lines.push({ start: tempStartPoint, end: { x, y }, erased: false });
            tempStartPoint = null;
            redrawCanvas();
        }
    } 
    else if (currentMode === 'erase') {
        // Find and mark the clicked line as erased
        const clickedLine = lines.find(line => 
            !line.erased && isPointOnLine(x, y, line.start, line.end)
        );
        if (clickedLine) {
            clickedLine.erased = true;
            redrawCanvas();
        }
    }
}



function checkLineCollision(laser, maxDistance) {
    let closestCollision = null;
    let closestDistance = Infinity;
    
    const moveVector = {
        x: laser.direction.x * maxDistance,
        y: laser.direction.y * maxDistance
    };
    
    lines.forEach(line => {
        if (line.erased) return;
        
        const intersection = getLineIntersection(
            laser.position,
            {x: laser.direction.x, y: laser.direction.y},
            line.start,
            line.end
        );
        
        if (intersection) {
            const dx = intersection.x - laser.position.x;
            const dy = intersection.y - laser.position.y;
            const distance = dx * laser.direction.x + dy * laser.direction.y;
            
            if (distance > 0 && distance < closestDistance) {
                closestDistance = distance;
                let normal = getLineNormal(line.start, line.end);
                
                // calculate direction
                const edgeVector = {
                    x: line.end.x - line.start.x,
                    y: line.end.y - line.start.y
                };
                
                // cross-multiplication
                const cross = (laser.direction.x * edgeVector.y) - (laser.direction.y * edgeVector.x);
                if (cross > 0) {
                    normal = { x: -normal.x, y: -normal.y };
                }
                
                const newDir = reflectVector(laser.direction, normal);
                
                closestCollision = {
                    point: intersection,
                    direction: newDir
                };
            }
        }
    });
    return closestCollision;
}

// Initial draw mode activation
switchMode('draw');