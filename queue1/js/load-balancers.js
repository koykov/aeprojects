import { Application, Graphics, Text } from './pixi.mjs';
import "./plotly.js";

let colors = {
    rr: "#E69F00",
    wrr: "#56B4E9",
    lc: "#009E73",
    pewma: "#D55E00",
}

var _globalId = 0;
function nextId() {
    return _globalId++;
}

function randRange({ min, max }) {
    if (min == max) {
        return min;
    }
    return Math.random() * (max - min) + min;
}

function percentInRange(value, { min, max }) {
    if (min === max) {
        return 1;
    }
    return (value - min) / (max - min);
}

function average(array) {
    return array.reduce((a, b) => a + b) / array.length;
}

function getAlgorithm(name) {
    switch (name) {
        case 'round-robin':
            return new RoundRobin();
        case 'least-connections':
            return new LeastConnections();
        case 'weighted-random':
            return new WeightedRandom();
        case 'random':
            return new RandomAlgorithm();
        case 'weighted-round-robin':
            return new WeightedRoundRobin();
        case 'dynamic-weighted-round-robin':
            return new DynamicWeightedRoundRobin();
        case 'peak-exponentially-weighted-moving-average':
            return new PeakExponentiallyWeightedMovingAverage();
    }
}

class PercentileCalculator {
    constructor() {
        this.dataPoints = [];
    }

    addDataPoint(value) {
        this.dataPoints.push(value);
    }

    getPercentile(percentile) {
        if (percentile <= 0 || percentile >= 100) {
            throw new Error('Percentile must be between 0 and 100');
        }

        const sortedDataPoints = this.dataPoints.slice().sort((a, b) => a - b);
        const index = (percentile / 100) * (sortedDataPoints.length - 1);
        const floor = Math.floor(index);
        const ceil = Math.ceil(index);

        if (floor === ceil) {
            return sortedDataPoints[floor];
        }

        const lower = sortedDataPoints[floor] * (ceil - index);
        const upper = sortedDataPoints[ceil] * (index - floor);
        return lower + upper;
    }
}

class PEWMA {
    constructor(alpha) {
        this.alpha = alpha;
        this.maxHistory = 100;
        this.ewmaPeaks = [];
    }

    update(value) {
        const prevPeak = this.ewmaPeaks[this.ewmaPeaks.length - 1] || 1000;
        const alpha = this.alpha;
        const beta = alpha / 4;

        const ewmaPeak = alpha * value + (1 - alpha) * prevPeak;
        this.ewmaPeaks.push(ewmaPeak);
        if (this.ewmaPeaks.length > this.maxHistory) {
            this.ewmaPeaks.shift();
        }

        if (value > prevPeak) {
            const peakRatio = ewmaPeak / prevPeak;
            const weightDelta = beta * peakRatio;

            for (let i = 0; i < this.ewmaPeaks.length - 1; i++) {
                this.ewmaPeaks[i] *= 1 - weightDelta;
            }

            this.ewmaPeaks[this.ewmaPeaks.length - 1] *= 1 + weightDelta;
        }
    }

    getPeak() {
        return this.ewmaPeaks[this.ewmaPeaks.length - 1];
    }
}

class Simulation extends Application {
    constructor({
        element,
        rps = 5,
        rpsVariance = 0,
        numServers = 2,
        queueMaxLength = 10,
        serverSize = 50,
        serverPower = { min: 1, max: 1 },
        serverPowerMax = 10,
        requestSize = 10,
        requestCost = { min: 50, max: 50 },
        requestCostMax = 1000,
        loadBalancersMax = 1,
        algorithm = "round-robin",
        showRpsSlider = false,
        visible = true,
        showRpsVarianceSlider = false,
        showRequestVarianceSlider = false,
        showServerPowerSlider = false,
        showNumServersSlider = false,
        showAlgorithmSelector = false,
    }) {
        super({
            backgroundAlpha: 0,
            resizeTo: element,
            antialias: visible,
            autoDensity: visible,
            autoStart: false,
            resolution: visible ? window.devicePixelRatio : 1,
        });
        this.renderer.plugins.interaction.autoPreventDefault = false;
        this.renderer.view.style.touchAction = 'auto';

        if (!visible) {
            element.style.display = 'none';
        }

        element.innerHTML = '';

        let f = (e) => {
            let bottomOfScreen = window.scrollY + window.innerHeight + 50;
            let topOfScreen = window.scrollY - 50;
            let bottomOfElement = element.offsetTop + element.offsetHeight;
            let topOfElement = element.offsetTop;

            let isVisible = bottomOfScreen > topOfElement &&
                topOfScreen < bottomOfElement;

            if (!this.ticker.started && isVisible) {
                this.start();
                return;
            }

            if (visible) {
                if (this.ticker.started && !isVisible) {
                    this.stop();
                    return;
                }
            }
        }

        window.addEventListener("scroll", f);
        window.addEventListener("focus", f);
        window.addEventListener("blur", f);
        f();

        let container = document.createElement('div');
        element.appendChild(container);

        let uiContainer = document.createElement('div');
        uiContainer.style.position = 'absolute';

        if (showAlgorithmSelector) {
            let algorithmSelectorContainer = document.createElement('div');
            let algorithmSelectorLabel = document.createElement('label');
            algorithmSelectorLabel.innerText = 'Algorithm';
            let algorithmSelector = document.createElement('select');
            algorithmSelector.innerHTML = `
                <option value="round-robin">Round Robin</option>
                <option value="weighted-random">Weighted Random</option>
                <option value="dynamic-weighted-round-robin">Weighted Round Robin</option>
                <option value="least-connections">Least Connections</option>
                <option value="peak-exponentially-weighted-moving-average">Peak EWMA</option>
                <option value="random">Random</option>
            `;
            algorithmSelector.value = algorithm;
            algorithmSelectorContainer.appendChild(algorithmSelector);
            algorithmSelectorContainer.appendChild(algorithmSelectorLabel);
            algorithmSelector.addEventListener('change', (e) => {
                this.loadBalancer.algorithm = getAlgorithm(e.target.value);
            });
            uiContainer.appendChild(algorithmSelectorContainer);
        }

        if (showRpsSlider) {
            let rpsSliderContainer = document.createElement('div');
            let rpsSliderLabel = document.createElement('label');
            rpsSliderLabel.innerText = 'RPS';
            let rpsSlider = document.createElement('input');
            rpsSlider.type = 'range';
            rpsSlider.min = 0;
            rpsSlider.max = 40;
            rpsSlider.value = Math.min(rps, parseInt(rpsSlider.max));
            rps = parseInt(rpsSlider.value);
            rpsSliderContainer.appendChild(rpsSlider);
            rpsSliderContainer.appendChild(rpsSliderLabel);
            rpsSlider.addEventListener('input', (e) => {
                this.rps = parseInt(e.target.value);
            });
            uiContainer.appendChild(rpsSliderContainer);
        }

        if (showRpsVarianceSlider) {
            let rpsVarianceSliderContainer = document.createElement('div');
            let rpsVarianceSliderLabel = document.createElement('label');
            rpsVarianceSliderLabel.innerText = 'RPS Variance';
            let rpsVarianceSlider = document.createElement('input');
            rpsVarianceSlider.type = 'range';
            rpsVarianceSlider.min = 0;
            rpsVarianceSlider.max = 100;
            rpsVarianceSlider.value = Math.min(rpsVariance * 100, parseInt(rpsVarianceSlider.max));
            rpsVariance = parseInt(rpsVarianceSlider.value) / 100;
            rpsVarianceSliderContainer.appendChild(rpsVarianceSlider);
            rpsVarianceSliderContainer.appendChild(rpsVarianceSliderLabel);
            rpsVarianceSlider.addEventListener('input', (e) => {
                this.rpsVariance = parseInt(e.target.value) / 100;
            });
            uiContainer.appendChild(rpsVarianceSliderContainer);
        }

        if (showRequestVarianceSlider) {
            let requestVarianceSliderContainer = document.createElement('div');
            let requestVarianceSliderLabel = document.createElement('label');
            requestVarianceSliderLabel.innerText = 'Request Cost Variance';
            let requestVarianceSlider = document.createElement('input');
            requestVarianceSlider.type = 'range';
            requestVarianceSlider.min = requestCost.min;
            requestVarianceSlider.max = requestCostMax;
            requestVarianceSlider.value = requestCost.max;
            requestVarianceSliderContainer.appendChild(requestVarianceSlider);
            requestVarianceSliderContainer.appendChild(requestVarianceSliderLabel);
            requestVarianceSlider.addEventListener('input', (e) => {
                this.requestCost = {
                    min: parseInt(e.target.min),
                    max: parseInt(e.target.value),
                };
            });
            uiContainer.appendChild(requestVarianceSliderContainer);
        }

        if (showServerPowerSlider) {
            let serverPowerSliderContainer = document.createElement('div');
            let serverPowerSliderLabel = document.createElement('label');
            serverPowerSliderLabel.innerText = 'Server Power Variance';
            let serverPowerSlider = document.createElement('input');
            serverPowerSlider.type = 'range';
            serverPowerSlider.min = serverPower.min;
            serverPowerSlider.max = serverPowerMax;
            serverPowerSlider.value = serverPower.min;
            serverPowerSliderContainer.appendChild(serverPowerSlider);
            serverPowerSliderContainer.appendChild(serverPowerSliderLabel);
            serverPowerSlider.addEventListener('input', (e) => {
                this.serverPower = {
                    min: parseInt(e.target.min),
                    max: parseInt(e.target.value)
                };
                this.serverPowerMax = parseInt(e.target.max);
            });
            uiContainer.appendChild(serverPowerSliderContainer);
        }

        if (showNumServersSlider) {
            let numServersSliderContainer = document.createElement('div');
            let numServersSliderLabel = document.createElement('label');
            numServersSliderLabel.innerText = 'Num Servers';
            let numServersSlider = document.createElement('input');
            numServersSlider.type = 'range';
            numServersSlider.min = 1;
            numServersSlider.max = Math.floor(this.screen.width / serverSize);
            numServersSlider.value = Math.min(parseInt(numServersSlider.max), numServers);
            numServers = parseInt(numServersSlider.value);
            numServersSliderContainer.appendChild(numServersSlider);
            numServersSliderContainer.appendChild(numServersSliderLabel);
            numServersSlider.addEventListener('input', (e) => {
                this.numServers = parseInt(e.target.value);
            });
            uiContainer.appendChild(numServersSliderContainer);
        }

        container.appendChild(uiContainer);
        container.appendChild(this.view);

        this.agents = [];
        this.parent = element;
        this.serverSize = serverSize;
        this.serverY = uiContainer.clientHeight + (requestSize * 2 * queueMaxLength) + this.screen.height / 20;
        this.queueMaxLength = queueMaxLength;

        // this.loadBalancer = new LoadBalancer(this, {
        //     x: this.screen.width / 2 - this.serverSize / 2,
        //     y: this.screen.height - serverSize - this.screen.height / 20,
        //     rps: rps,
        //     rpsVariance: rpsVariance,
        //     requestCost: requestCost,
        //     size: serverSize,
        //     algorithm: getAlgorithm(algorithm),
        // });
        this.loadBalancers = [];
        let offLB = 0;
        let distLB = this.screen.width / loadBalancersMax;
        for (let i = 0; i < loadBalancersMax; i++) {
            this.loadBalancers.push(new LoadBalancer(this, {
                // x: this.screen.width / 4 - this.serverSize / 2,
                x: offLB * distLB + distLB / 3,
                y: this.screen.height - serverSize - this.screen.height / 20,
                rps: rps,
                rpsVariance: rpsVariance,
                requestCost: requestCost,
                size: serverSize,
                algorithm: getAlgorithm(algorithm),
            }));
            console.log(offLB * distLB);
            offLB++;
        }
        // this.loadBalancers.push(new LoadBalancer(this, {
        //     x: this.screen.width / 4 - this.serverSize / 2,
        //     y: this.screen.height - serverSize - this.screen.height / 20,
        //     rps: rps,
        //     rpsVariance: rpsVariance,
        //     requestCost: requestCost,
        //     size: serverSize,
        //     algorithm: getAlgorithm(algorithm),
        // }));
        // this.loadBalancers.push(new LoadBalancer(this, {
        //     x: this.screen.width/2 + this.screen.width/4,
        //     y: this.screen.height - serverSize - this.screen.height / 20,
        //     rps: rps,
        //     rpsVariance: rpsVariance,
        //     requestCost: requestCost,
        //     size: serverSize,
        //     algorithm: getAlgorithm(algorithm),
        // }));

        for (let i = 0; i < numServers; i++) {
            var power = serverPower;
            if (Array.isArray(serverPower)) {
                power = { min: serverPower[i], max: serverPower[i] };
            }

            const server = new Server(
                this,
                {
                    x: 0,
                    y: this.serverY,
                    power: power,
                    powerMax: serverPowerMax,
                    size: serverSize,
                    queueMaxLength: queueMaxLength,
                    requestSize: requestSize,
                }
            );
            // this.loadBalancer.addServer(server);
            this.loadBalancers.forEach(function (el){
                el.addServer(server);
            });
        }

        this.positionServers();
        this.ticker.add((delta) => this.update(delta));
    }

    onRequestDestroyed(callback) {
        this.loadBalancer.onRequestDestroyed(callback);
    }

    positionServers() {
        console.log(this.loadBalancers);
        let numServers = this.loadBalancers[0].servers.length;
        let spacing = (this.screen.width - this.serverSize * numServers) / (numServers + 1);

        for (let i = 0; i < numServers; i++) {
            const server = this.loadBalancers[0].servers[i];
            server.setX(spacing + (this.serverSize + spacing) * i);
        }
    }

    set numServers(numServers) {
        let currentNumServers = this.loadBalancer.servers.length;
        if (numServers > currentNumServers) {
            for (let i = currentNumServers; i < numServers; i++) {
                const server = new Server(
                    this,
                    {
                        x: 0,
                        y: this.serverY,
                        power: this.loadBalancer.servers[0].powerRange,
                        powerMax: this.loadBalancer.servers[0].powerMax,
                        size: this.serverSize,
                        queueMaxLength: this.queueMaxLength,
                        requestSize: this.requestSize,
                    }
                );
                console.log(server);
                this.loadBalancer.addServer(server);
            }
        } else if (numServers < currentNumServers) {
            for (let i = currentNumServers - 1; i >= numServers; i--) {
                this.loadBalancer.servers[i].destroy();
                this.loadBalancer.servers.splice(i, 1);
            }
        }

        this.positionServers();
    }

    set requestCost(requestCost) {
        this.loadBalancer.requestCost = requestCost;
    }

    set serverPower(serverPower) {
        for (let server of this.loadBalancer.servers) {
            server.power = serverPower;
        }
    }

    get rps() {
        return this.loadBalancer.rps;
    }

    set rps(rps) {
        this.loadBalancer.rps = rps;
    }

    get rpsVariance() {
        return this.loadBalancer.rpsVariance;
    }

    set rpsVariance(rpsVariance) {
        this.loadBalancer.rpsVariance = rpsVariance;
    }

    add(agent) {
        this.stage.addChild(agent);
        this.agents.push(agent);
    }

    update(delta) {
        if (this.debug) {
            console.log(`[simulator] checking for agents to remove`);
        }
        var numAgentsRemoved = 0;
        for (let i = this.agents.length - 1; i >= 0; i--) {
            if (this.debug) {
                console.log(`[simulator] checking index ${i} (${this.agents[i].id})`);
            }
            if (this.agents[i].destroyed) {
                var removed = this.agents.splice(i, 1);
                numAgentsRemoved++;
                if (this.debug) {
                    console.log(`[simulator] removed ${removed[0].id}`);
                }
            }
        }
        if (this.debug) {
            console.log(`[simulator] removed ${numAgentsRemoved} agents`);
        }

        if (this.debug) {
            console.log(`[simulator] update(${delta})`);
        }
        for (let agents of this.agents) {
            agents.update(delta);
        }
        if (this.debug) {
            console.log(`[simulator] done updating`);
        }
    }
}

class Agent extends Graphics {
    constructor(simulation) {
        super();
        this.simulation = simulation;
        this.id = nextId();
        this.debug = false;
        this.simulation.add(this);
        this.onDestroyHooks = [];
    }

    update(delta) {
        if (this.debug) {
            console.log(`[${this.id}] update(${delta})`);
        }
    }

    destroy() {
        if (this.debug) {
            console.log(`[${this.id}] destroy()`);
        }
        for (let f of this.onDestroyHooks) {
            f();
        }
        super.destroy();
    }

    onDestroy(f) {
        this.onDestroyHooks.push(f);
    }
}

class RequestQueue extends Agent {
    constructor(simulation, { x, y, length, requestSize = 10, color = "#dddddd" }) {
        super(simulation);
        this.x = x;
        this.y = y;
        this.length = length;
        this.requests = []
        this.color = color;

        this.beginFill("#FFFFFF");
        this.lineStyle(1, this.color, 1, 0)
        this.drawRect(
            -requestSize - 1,
            -requestSize * 2 * length + 8,
            requestSize * 2 + 2,
            requestSize * length * 2 - 6,
        );
        this.endFill();
    }

    setX(x) {
        this.x = x;
        for (let request of this.requests) {
            request.x = x;
        }
    }

    enqueue(request) {
        if (this.requests.length >= this.length) {
            return false;
        }

        request.queued = Date.now();
        if (this.requests.length === 0) {
            request.centerX = this.x;
            request.centerY = this.y;
            this.requests.push(request);
            return true;
        }

        let tail = this.requests[this.requests.length - 1];
        this.requests.push(request);
        request.centerX = tail.centerX;
        request.y = tail.y - tail.size * 2;

        return true;
    }

    dequeue() {
        let request = this.requests.shift();
        for (let r of this.requests) {
            r.y += r.size * 2;
        }
        return request
    }

    destroy() {
        super.destroy();
        for (let request of this.requests) {
            request.destroy();
        }
    }
}



class Server extends Agent {
    constructor(simulation, {
        x,
        y,
        size = 40,
        power = { min: 1, max: 10 },
        powerMax = 10,
        queueMaxLength = 10,
        requestSize = 10,
    }) {
        super(simulation);
        this.x = x;
        this.y = y;
        this._width = size;
        this._height = size;
        this.power = power;
        this.powerMax = powerMax;
        this.currentRequest = null;

        this.text = new Text("", { fill: 0x000000 });
        this.text.y = this._height + 5;
        this.addChild(this.text);

        this.color = 0xFFFFFF;
        this.draw();

        this.queue = new RequestQueue(this.simulation, {
            x: this.centerX,
            y: this.y - 2,
            length: queueMaxLength,
            requestSize: requestSize,
        });
        simulation.add(this.queue);
    }

    setX(x) {
        this.x = x;
        this.queue.setX(this.centerX);
        if (this.currentRequest) {
            this.currentRequest.centerX = this.centerX;
        }
    }

    draw() {
        this.beginFill(this.color);
        this.drawRoundedRect(0, 0, this._width, this._height, 10);
        this.endFill();
    }

    set power(power) {
        this._power = randRange(power);
        this._powerRange = power;
        this._initialPower = power;
    }

    get power() {
        return this._power;
    }

    get powerRange() {
        return this._powerRange;
    }

    get queueLength() {
        return this.queue.requests.length;
    }

    get centerX() {
        return this.x + (this._width / 2);
    }

    get centerY() {
        return this.y + (this._height / 2);
    }

    setText(text) {
        if (!typeof text === "string") {
            text = text.toString();
        }
        this.text.text = text;
        this.text.x = this._width / 2 - this.text.width / 2;
    }

    addRequest(request) {
        if (!this.currentRequest) {
            this.currentRequest = request;
            return;
        }

        let queued = this.queue.enqueue(request);
        if (!queued) {
            new DroppedRequest(this.simulation, {
                x: request.x, y: request.y, size: request.size
            });
            request.dropped = true;
            request.destroy();
        }
    }

    set currentRequest(request) {
        this._currentRequest = request;
        if (request) {
            request.centerX = this.centerX;
            request.centerY = this.centerY;
            request.workStarted = Date.now();
        }
    }

    get currentRequest() {
        return this._currentRequest;
    }

    update(delta) {
        super.update(delta);

        if (this.destroyed) {
            return;
        }

        let percent = percentInRange(this._power, {
            min: 1,
            max: this.powerMax,
        });

        this.color = blendColors(0xDDDDDD, 0x555555, percent);
        this.tint = this.color;

        let power = this._power;

        while (true) {
            if (!this.currentRequest) {
                this.currentRequest = this.queue.dequeue();
            }

            if (!this.currentRequest) {
                break;
            }

            this.currentRequest.cost -= power * delta;
            this.currentRequest.timeSpentProcessingMS += this.simulation.ticker.elapsedMS;
            if (this.currentRequest.cost <= 0) {
                power = -this.currentRequest.cost;
                this.currentRequest.served = Date.now();
                this.currentRequest.destroy();
                this.currentRequest = null;
            } else {
                break;
            }
        }
    }

    destroy() {
        super.destroy();
        this.queue.destroy();
    }
}

class LoadBalancingAlgorithm {
    chooseServer(request, servers) { }
    onRequestDestroyed(request) { }
    init(loadBalancer) { }
}

class RoundRobin extends LoadBalancingAlgorithm {
    constructor() {
        super();
        this.currentServer = 0;
    }

    chooseServer(request, servers) {
        if (this.currentServer >= servers.length) {
            this.currentServer = 0;
        }

        const server = servers[this.currentServer];
        this.currentServer += 1;
        return server;
    }
}

class WeightedRandom extends LoadBalancingAlgorithm {
    chooseServer(request, servers) {
        let totalPower = 0;
        for (let server of servers) {
            totalPower += server.power;
        }

        let random = Math.random() * totalPower;
        for (let server of servers) {
            random -= server.power;
            if (random <= 0) {
                return server;
            }
        }
    }
}

class WeightedRoundRobin extends LoadBalancingAlgorithm {
    constructor() {
        super();
        this.currentServer = 0;
        this.numRequestsSentToCurrentServer = 0;
    }

    chooseServer(request, servers) {
        let minPower = 999999;
        for (let server of servers) {
            minPower = Math.min(minPower, server.power);
        }

        var server = servers[this.currentServer];
        let requestsToSend = Math.ceil(server.power / minPower);

        if (this.numRequestsSentToCurrentServer >= requestsToSend) {
            this.currentServer += 1;
            if (this.currentServer >= servers.length) {
                this.currentServer = 0;
            }
            this.numRequestsSentToCurrentServer = 0;
            server = servers[this.currentServer];
        }

        this.numRequestsSentToCurrentServer += 1;
        return server;
    }
}

class DynamicWeightedRoundRobin extends LoadBalancingAlgorithm {
    constructor() {
        super();
        this.currentServer = 0;
        this.numRequestsSentToCurrentServer = 0;
        this.latencies = {};
        this.averageLatencies = {};
        this.range = 3;
    }

    chooseServer(request, servers) {
        let minLatency = 999999;
        let maxLatency = 0;
        for (let server of servers) {
            minLatency = Math.min(minLatency, this.averageLatencies[server.id] || 99999999);
            maxLatency = Math.max(maxLatency, this.averageLatencies[server.id] || 0);
        }

        var server = servers[this.currentServer];

        var requestsToSend;
        if (this.latencies[server.id] === undefined) {
            requestsToSend = 1;
        } else {
            requestsToSend = this.range - Math.ceil(((this.averageLatencies[server.id] - minLatency) / maxLatency) * this.range);
        }

        if (this.numRequestsSentToCurrentServer >= requestsToSend) {
            this.currentServer += 1;
            if (this.currentServer >= servers.length) {
                this.currentServer = 0;
            }
            this.numRequestsSentToCurrentServer = 0;
            server = servers[this.currentServer];
        }

        this.numRequestsSentToCurrentServer += 1;
        return server;
    }

    onRequestDestroyed(request) {
        if (request.dropped) {
            return;
        }
        if (this.latencies[request.destination.id] === undefined) {
            this.latencies[request.destination.id] = [];
        }
        this.latencies[request.destination.id].push(request.timeSpentProcessingMS);
        if (this.latencies[request.destination.id].length > 3) {
            this.latencies[request.destination.id].shift();
        }
        this.averageLatencies[request.destination.id] = average(this.latencies[request.destination.id]);

        request.destination.setText(`${(this.averageLatencies[request.destination.id] / 1000).toFixed(1)}s`);
    }
}

class PeakExponentiallyWeightedMovingAverage extends LoadBalancingAlgorithm {
    constructor() {
        super();
        this.pewma = {};
        this.connections = {};
        this.smoothing = 0.2;
    }

    init(loadBalancer) {
        this.connections = {};
        for (let agent of loadBalancer.simulation.agents) {
            if (agent instanceof Request) {
                if (this.connections[agent.destination.id] === undefined) {
                    this.connections[agent.destination.id] = 0;
                }
                this.connections[agent.destination.id] += 1;
            }
        }
    }

    chooseServer(request, servers) {
        for (let server of servers) {
            if (this.connections[server.id] === undefined) {
                this.connections[server.id] = 0;
            }
            if (this.pewma[server.id] === undefined) {
                this.pewma[server.id] = new PEWMA(this.smoothing);
            }
        }

        let chosen = servers[0];
        for (let i = 1; i < servers.length; i++) {
            let server = servers[i];
            let lowest = (this.connections[chosen.id] + 1) * (this.pewma[chosen.id].getPeak() || 1000);
            let current = (this.connections[server.id] + 1) * (this.pewma[server.id].getPeak() || 1000);
            if (current < lowest) {
                chosen = server;
            }
        }

        this.connections[chosen.id] += 1;
        return chosen;
    }

    onRequestDestroyed(request) {
        this.connections[request.destination.id] -= 1;
        if (this.pewma[request.destination.id] === undefined) {
            this.pewma[request.destination.id] = new PEWMA(this.smoothing);
        }
        if (request.dropped) {
            this.pewma[request.destination.id].update(5000);
            return;
        }
        this.pewma[request.destination.id].update(request.age);
        //request.destination.setText(`${(this.pewma[request.destination.id].getPeak() / 1000).toFixed(1)}s`);
    }
}


class LeastConnections extends LoadBalancingAlgorithm {
    constructor() {
        super();
        this.connections = {};
    }

    init(loadBalancer) {
        this.connections = {};
        for (let agent of loadBalancer.simulation.agents) {
            if (agent instanceof Request) {
                if (this.connections[agent.destination.id] === undefined) {
                    this.connections[agent.destination.id] = 0;
                }
                this.connections[agent.destination.id] += 1;
            }
        }
    }


    chooseServer(request, servers) {
        for (let server of servers) {
            if (this.connections[server.id] === undefined) {
                this.connections[server.id] = 0;
            }
        }

        let chosen = [servers[0]];
        for (let i = 1; i < servers.length; i++) {
            let server = servers[i];
            let lowest = this.connections[chosen[0].id];
            let current = this.connections[server.id];
            if (current < lowest) {
                chosen = [server];
            } else if (current === lowest) {
                chosen.push(server);
            }
        }

        let server = chosen[Math.floor(Math.random() * chosen.length)];
        this.connections[server.id] += 1;
        return server;
    }

    onRequestDestroyed(request) {
        this.connections[request.destination.id] -= 1;
    }
}

class RandomAlgorithm extends LoadBalancingAlgorithm {
    chooseServer(request, servers) {
        return servers[Math.floor(Math.random() * servers.length)];
    }
}

class LoadBalancer extends Server {
    constructor(simulation, {
        x,
        y,
        rps,
        rpsVariance,
        algorithm,
        size = 40,
        requestSize = 10,
        requestCost = { min: 10, max: 10 }
    }) {
        super(simulation, { x, y, size });
        this.rps = rps;
        this.msUntilNextRequest = 0;
        this.requestSize = requestSize;
        this.rpsVariance = rpsVariance;
        this.servers = [];
        this.algorithm = algorithm;
        this.requestCost = requestCost;
        this.onRequestDestroyedCallbacks = [];

        this.beginFill(0x000000);
        this.drawRoundedRect(0, 0, this._width, this._height, 10);
        this.endFill();

        this.queue.destroy();
    }

    onRequestDestroyed(callback) {
        this.onRequestDestroyedCallbacks.push(callback);
    }

    set algorithm(algorithm) {
        this._algorithm = algorithm;
        this.algorithm.init(this);
        for (let server of this.servers) {
            server.setText("");
        }
    }

    get algorithm() {
        return this._algorithm;
    }

    update(delta) {
        if (this.rps === 0) {
            return;
        }
        let msPerRequest = 1000 / this.rps;
        let elapsedMS = this.simulation.ticker.elapsedMS;
        this.msUntilNextRequest -= elapsedMS;
        if (this.msUntilNextRequest <= 0) {
            this.msUntilNextRequest = msPerRequest * randRange({ min: 1 - this.rpsVariance, max: 1 + this.rpsVariance });
            this.sendRequest();
        }
    }

    addServer(server) {
        this.servers.push(server);
    }

    sendRequest() {
        if (this.servers.length === 0) {
            return;
        }

        const request = new Request(this.simulation, {
            source: this,
            size: this.requestSize,
            cost: this.requestCost,
        });
        const server = this.algorithm.chooseServer(request, this.servers);
        request.onDestroy(() => {
            this.algorithm.onRequestDestroyed(request);
            for (let callback of this.onRequestDestroyedCallbacks) {
                callback(request);
            }
        });
        request.destination = server;
    }
}

class Request extends Agent {
    constructor(simulation, { source = null, destination = null, cost = { min: 1, max: 1 }, size = 10 }) {
        super(simulation);
        this.size = size;
        this.source = source;
        this.speed = 10;
        this.destination = destination;
        this.arrivedAtDestination = false;
        this.costRange = cost;
        this.cost = randRange(cost);
        this.initialCost = this.cost;
        this.created = Date.now();
        this.queued = null;
        this.workStarted = null;
        this.served = null;
        this.age = 0;
        this.timeSpentProcessingMS = 0;
        this.dropped = false;

        this.draw();
    }

    get color() {
        let green = 0x04BF8A;
        let red = 0xF22233;

        let thresholdMs = 10000;
        return blendColors(green, red, Math.min(1, this.age / thresholdMs));
    }

    draw() {
        if (this.destroyed) {
            return;
        }
        this.clear();
        this.beginFill(0xFFFFFF);
        this.drawCircle(0, 0, this.size * (this.cost / this.initialCost));
        this.endFill();
    }

    set source(source) {
        if (!source) {
            return;
        }
        this.x = source.centerX;
        this.y = source.centerY;
    }

    get centerX() {
        return this.x;
    }

    get centerY() {
        return this.y;
    }

    set centerX(x) {
        this.x = x;
    }

    set centerY(y) {
        this.y = y;
    }

    update(delta) {
        super.update(delta);

        this.age += this.simulation.ticker.elapsedMS;
        this.tint = this.color;

        if (this.destination.destroyed) {
            this.destroy();
            return;
        }

        if (this.destroyed) {
            return;
        }

        let scale = this.cost / this.initialCost;
        this.scale.set(scale, scale);

        if (this.arrivedAtDestination) {
            return;
        }

        if (!this.destination) {
            return;
        }

        const dx = this.destination.centerX - this.centerX;
        const dy = this.destination.centerY - this.centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < this.speed * delta) {
            this.centerX = this.destination.centerX;
            this.centerY = this.destination.centerY;
            this.destination.addRequest(this);
            this.arrivedAtDestination = true;
            return;
        }

        const rotation = Math.atan2(this.destination.centerY - this.centerY, this.destination.centerX - this.centerX);
        this.x += Math.cos(rotation) * this.speed * delta;
        this.y += Math.sin(rotation) * this.speed * delta;
    }

}

class DroppedRequest extends Agent {
    constructor(simulation, { x, y, size }) {
        super(simulation);
        this.size = size;
        this.x = x;
        this.y = y;
        this.vx = randRange({ min: -1, max: 1 });
        this.vy = randRange({ min: -1, max: 1 });

        this.beginFill(0xff0000);
        this.drawCircle(0, 0, this.size);
        this.endFill();
    }

    update(delta) {
        super.update(delta);
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.5 * delta;

        if (this.x < 0 || this.x > this.simulation.screen.width) {
            this.destroy();
            return;
        }
        if (this.y < 0 || this.y > this.simulation.screen.height) {
            this.destroy();
            return;
        }
    }
}

function blendColors(color1, color2, blend) {
    // convert integer hex values to RGB arrays
    var rgb1 = hexToRgb(color1);
    var rgb2 = hexToRgb(color2);

    // blend the RGB values
    var r = Math.round(rgb1.r * (1 - blend) + rgb2.r * blend);
    var g = Math.round(rgb1.g * (1 - blend) + rgb2.g * blend);
    var b = Math.round(rgb1.b * (1 - blend) + rgb2.b * blend);

    // convert the blended RGB values back to integer hex
    var blendedColor = rgbToHex(r, g, b);

    return blendedColor;
}

function hexToRgb(hex) {
    // convert 24-bit integer hex value to RGB array
    var r = (hex >> 16) & 255;
    var g = (hex >> 8) & 255;
    var b = hex & 255;

    return { r: r, g: g, b: b };
}

function rgbToHex(r, g, b) {
    // convert RGB values to 24-bit integer hex value
    var hexR = r.toString(16).padStart(2, '0');
    var hexG = g.toString(16).padStart(2, '0');
    var hexB = b.toString(16).padStart(2, '0');

    return parseInt(`${hexR}${hexG}${hexB}`, 16);
}

document.addEventListener("DOMContentLoaded", function () {
    new Simulation({
        element: document.getElementById("7"),
        numServers: 1,
        serverPower: [3],
        serverPowerMax: 8,
        loadBalancersMax: 2,
        rps: 5,
        requestCost: { min: 100, max: 300 },
        queueMaxLength: 5,
        debug: true,
    });
});
