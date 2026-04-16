function getFileName(path) {
  return path.split('/').pop();
}

function getAllFileNames(blocks) {
  const names = [];
  blocks.forEach(block => {
    const fileName = getFileName(block.path);
    if (names.length == 0 || names[names.length - 1].fileName !== fileName) {
        names.push({fileName: fileName, block: block});
    } else if (names.length > 0) {
        names[names.length - 1].block = block
    }
  });
  return names;
}

function lastFileLink(block) {
    return `https://github.com/zephyrproject-rtos/zephyr/blob/${block.lastCommit}/${block.path}`
}
function firstFileLink(block) {
    return `https://github.com/zephyrproject-rtos/zephyr/blob/${block.firstCommit}/${block.path}`
}
function lastCommitLink(block) {
    return `https://github.com/zephyrproject-rtos/zephyr/commit/${block.lastCommit}`
}
function firstCommitLink(block) {
    return `https://github.com/zephyrproject-rtos/zephyr/commit/${block.firstCommit}`
}
function boardLink(vendor, board) {
    return `https://docs.zephyrproject.org/latest/boards/${vendor}/${board}/doc/index.html`
}
function vendorLink(vendor) {
    return `https://docs.zephyrproject.org/latest/boards/${vendor}`
}

function createInfoBox(infoBoxElement, info) {
    // Clear the existing content
    infoBoxElement.innerHTML = '';

    // Create the main container
    const container = document.createElement('div');
    container.className = 'info-box-container';

    // Create close button
    const closeButton = document.createElement('button');
    closeButton.className = 'close-button';
    closeButton.textContent = 'x';
    closeButton.addEventListener('click', function() {
        infoBoxElement.innerHTML = '';
    });
    container.appendChild(closeButton);

    // File name section
    const fileNameSection = document.createElement('div');
    fileNameSection.className = 'file-name-section';

    const blocks = info.DVShapedDefinition.blocks;
    const lastAliveTime = info.DVShapedDefinition.lastAliveTime
    const fileNames = getAllFileNames(blocks);
    
    // Show previous filenames in smaller font if there are multiple
    if (fileNames.length > 1) {
        const previousNamesDiv = document.createElement('div');
        previousNamesDiv.className = 'file-name-history';
        
        fileNames.slice(0, -1).forEach((name, index) => {
            const nameLink = document.createElement('a');
            nameLink.textContent = name.fileName;
            nameLink.href = firstFileLink(name.block)
            nameLink.target = '_blank'
            previousNamesDiv.appendChild(nameLink);
        
            const firstBuffer = document.createElement('span');
            firstBuffer.textContent = ' ';
            previousNamesDiv.appendChild(firstBuffer);

            const arrow = document.createElement('a');
            arrow.className = 'file-name-arrow';
            arrow.href = lastCommitLink(name.block)
            arrow.textContent = '->';
            arrow.target = '_blank'
            previousNamesDiv.appendChild(arrow);

            const secondBuffer = document.createElement('span');
            secondBuffer.textContent = ' ';
            previousNamesDiv.appendChild(secondBuffer);
        });
        
        fileNameSection.appendChild(previousNamesDiv);
    }
    
    // Show latest filename prominently
    const currentFileNameLink = document.createElement('a');
    currentFileNameLink.className = 'file-name-primary';
    currentFileNameLink.textContent = fileNames[fileNames.length - 1].fileName;
    currentFileNameLink.href = lastFileLink(fileNames[fileNames.length - 1].block)
    currentFileNameLink.target = '_blank'
    fileNameSection.appendChild(currentFileNameLink);

    // Board and Vendor section
    const patternSection = document.createElement('div');
    patternSection.className = 'pattern-section';

    if (info.DVPieChartDefinition) {
        const vendor = info.DVPieChartDefinition
        const vendorDiv = document.createElement('div');
        vendorDiv.innerHTML = `<strong>Vendor:</strong> <a href="${vendorLink(vendor.name)}" target="_blank">${vendor.name}<a>`;
        patternSection.appendChild(vendorDiv);

        if (info.DVCompositeSliceDefinition) {
            const board = info.DVCompositeSliceDefinition
            const boardDiv = document.createElement('div');
            boardDiv.innerHTML = `<strong>Board:</strong> <a href="${boardLink(vendor.name, board.name)}" target="_blank">${board.name}<a>`;
            patternSection.appendChild(boardDiv);
        }
    }

    // File history section
    const historySection = document.createElement('div');
    historySection.className = 'history-section';

    const historyTitle = document.createElement('h3');
    historyTitle.textContent = 'File History';
    historySection.appendChild(historyTitle);

    const tracksListContainer = document.createElement('div');
    tracksListContainer.className = 'tracks-list-container';
    tracksListContainer.style.width = '500px'

    const tracksList = document.createElement('div');
    tracksList.className = 'tracks-list';
    

    const start = Date.parse(blocks[0].startTime)
    const end = Date.parse(lastAliveTime)
    const durationDays = (end - start) / 86400000
    tracksList.style.width = `${durationDays * PIXELS_PER_DAY}px`

    const paths = getAllFilePaths(blocks)
    for (let path of paths) {
        const track = document.createElement('div');
        track.className = 'track'
        track.innerHTML = `<div class="track-scroll"><span class="track-label">${path.path}</span></div>`
        
        for (let block of path.blocks) {
            
            const blockStart = Date.parse(block.startTime)
            const blockEnd = block.isLast ? end : Date.parse(block.endTime)
            const blockDurationDays = (blockEnd - blockStart) / 86400000
            const blockSinceStartDays = (blockStart - start) / 86400000

            const trackLine = document.createElement('div');
            
            const minWidthForButtonsInside = 52;
            const minWidthForTextInside = 150;
            const rectWidth = blockDurationDays * PIXELS_PER_DAY;

            let buttonClass;
            if (rectWidth >= minWidthForTextInside) {
                buttonClass = 'block-rect-wide'; // text and buttons inside
            } else if (rectWidth >= minWidthForButtonsInside) {
                buttonClass = 'block-rect-medium'; // buttons inside, text outside
            } else {
                buttonClass = 'block-rect-narrow'; // buttons and text outside
            }

            const firstFileButton   = `<a target="_blank" class='block-btn block-btn-left' href='${firstFileLink(block)}'>?</a>`
            const lastFileButton    = `<a target="_blank" class='block-btn block-btn-right' href='${lastFileLink(block)}'>?</a>`
            const lastCommitButton  = `<a target="_blank" class='block-btn block-btn-right' href='${lastCommitLink(block)}'>></a>`
            trackLine.innerHTML = `
                <div class='block-rect ${buttonClass}' style='width:${rectWidth}px; translate:${Math.floor(blockSinceStartDays * PIXELS_PER_DAY)}px 0px'>
                    ${firstFileButton}
                    <span class='block-info'>${Math.ceil(blockDurationDays)} days - ${block.numberOfCommits} commits</span>
                    ${block.isLast ? lastFileButton : lastCommitButton}
                </div>
            `;


            track.appendChild(trackLine)
        }

        tracksList.appendChild(track)
    }
    
    const startYear = new Date(blocks[0].startTime).getFullYear()
    const endYear   = new Date(lastAliveTime).getFullYear()

    const startYearStart = new Date(startYear, 0, 0)
    const startOffsetDays = (start - startYearStart) / 86400000
    const startOffsetPixels = startOffsetDays * PIXELS_PER_DAY

    const endYearStart = new Date(endYear, 0, 0)
    const endOffsetDays = (end - endYearStart) / 86400000
    const endOffsetPixels = endOffsetDays * PIXELS_PER_DAY

    console.log(new Date(blocks[0].startTime))
    console.log(new Date(startYear, 0, 0))
    console.log(startOffsetPixels)
    console.log(endOffsetPixels)

    const yearTrack = document.createElement('div');
    yearTrack.className = 'year-track'
    for (let year = startYear; year <= endYear; year++) {
        const yearSegment = document.createElement('div');
        yearSegment.className = 'year-segment'

        if (year == startYear) {
            yearSegment.style.width = `${PIXELS_PER_YEAR - startOffsetPixels}px`
        } else if (year == endYear) {
            yearSegment.style.width = `${endOffsetPixels}px`
        } else {
            yearSegment.style.width = `${PIXELS_PER_YEAR}px`
        } 
        yearSegment.innerHTML = `<span>${year}</span>`
        yearTrack.appendChild(yearSegment)
    }
    tracksList.appendChild(yearTrack)

    tracksListContainer.appendChild(tracksList)
    historySection.appendChild(tracksListContainer);

    const instructions = document.createElement('div');
    instructions.className = 'history-instructions'
    instructions.innerHTML = '[?]: inspect file - [>]: inspect move commit'

    container.appendChild(fileNameSection);
    container.appendChild(patternSection);
    container.appendChild(historySection);
    container.appendChild(instructions)
    infoBoxElement.appendChild(container);
}

function getAllFilePaths(blocks) {
    const paths = [...new Set(blocks.map(block => { return {path: block.path, blocks: []} }))];
    for (let block of blocks) {
        for (let path of paths) {
            if (path.path == block.path) {
                path.blocks.push(block)
                break
            }
        }
    }
    return paths
}

const PIXELS_PER_DAY = 1
const PIXELS_PER_YEAR = PIXELS_PER_DAY * 365