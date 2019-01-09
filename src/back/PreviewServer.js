var http = require('http'),
    url = require('url'),
    fs = require('fs'),
    util = require('util'),
    path = require('path'),
    ConfigEmitter = require('./ConfigEmitter.js').ConfigEmitter,
    Project = require('./Project.js').Project,
    ProjectServer = require('./ProjectServer.js').ProjectServer,
    MIMES = {
        '.html' : 'text/html',
        '.css' : 'text/css',
        '.js' : 'application/javascript',
        '.png' : 'image/png',
        '.gif' : 'image/gif',
        '.jpg' : 'image/jpeg',
        '.woff' : 'application/octet-stream',
        '.ttf' : 'application/octet-stream',
        '.svg' : 'image/svg+xml',
        '.ico' : 'image/x-icon'
    };

var PreviewServer = function (config, root, options) {
    this.CLASSNAME = 'server';
    ConfigEmitter.call(this, config);
    this.config.server = this;
    this.initRoutes();
    options = options || {};
    this.projects = {};
    this.server = http.createServer();
    this.server.on('request', this.serve.bind(this));
    this.server.timeout = 0;
    this.root = root;
    this.emitAndForward('init');
    this.config.on('command:serve', this.listen.bind(this));
};

util.inherits(PreviewServer, ConfigEmitter);

PreviewServer.prototype.listen = function () {
    if (this.config.parsed_opts.path && 
        fs.existsSync(this.config.parsed_opts.path) &&
        fs.lstatSync(this.config.parsed_opts.path).isFile()) {
        var project = new Project(this.config, this.config.parsed_opts.path);
        this.registerProject(project);
        this.setDefaultProject(project);
    }
    else if(!fs.existsSync(this.config.parsed_opts.path) || 
        !fs.lstatSync(this.config.parsed_opts.path).isDirectory()) {
        throw new Error('incorrect path, not a .mml file, or a valid directory');
    }
    this.server.listen(this.config.parsed_opts.port, this.config.parsed_opts.host);
    this.config.log('PreviewServer started, you can browse http://' + this.config.parsed_opts.host + ':' + this.config.parsed_opts.port);
    this.emitAndForward('listen');
};

PreviewServer.prototype.registerProject = function (project) {
    this.projects[project.id] = new ProjectServer(project, this);  // TODO avoid cross ref
};

PreviewServer.prototype.setDefaultProject = function (project) {
    this.defaultProject = project;
};

PreviewServer.prototype.serve = function (req, res) {
    res.on('finish', function () {
        // 204 are empty responses from poller, do not pollute
        if (this.statusCode !== 204) console.warn('[httpserver]', req.url, this.statusCode);
    });
    var uri = url.parse(req.url, true),
        urlpath = uri.pathname,
        els = urlpath.split('/');
    if (urlpath === '/') this.serveHome(uri, req, res);
    else if (this.hasRoute(urlpath)) this._routes[urlpath].call(this, req, res);
    else if (this.projects[els[1]]) this.forwardToProject(uri, els[1], req, res);
    else if (fs.existsSync(path.join(this.config.parsed_opts.path, els[1], 'project.mml'))) {
        this.registerProject(new Project(this.config, path.join(this.config.parsed_opts.path, els[1], 'project.mml')));
        this.forwardToProject(uri, els[1], req, res);
    }
    else this.serveFile(urlpath, res);
};

PreviewServer.prototype.forwardToProject = function (uri, id, req, res) {
    uri.pathname = uri.pathname.replace('/' + id, '');
    this.projects[id].serve(uri, req, res);
};

PreviewServer.prototype.serveHome = function (uri, req, res) {
    // Go to project for now
    if (this.defaultProject) return this.redirect(this.defaultProject.id, res);
    return this.serveFile(path.join(kosmtik.src, 'front/index.html'), res);
};

PreviewServer.prototype.redirect = function (newuri, res) {
    res.writeHead(302, {'Location': newuri, 'Cache-Control': 'private, no-cache, must-revalidate'});
    res.end();
};

PreviewServer.prototype.serveFile = function (filepath, res) {
    var self = this,
        ext = path.extname(filepath);
    if (!MIMES[ext]) return this.notFound(filepath, res);
    
    //we also want to find the files if the modules where deduped by npm 3+
    if(filepath.startsWith('/node_modules/')) {
        filepath = require.resolve(filepath.substr(14));
    } else {
        filepath = path.join(this.root, filepath);
    }
    
    fs.exists(filepath, function(exists) {
        if (exists) {
            fs.readFile(filepath, function(err, contents) {
                if(!err) {
                    res.writeHead(200, {
                        'Content-Type': MIMES[ext],
                        'Content-Length' : contents.length
                    });
                    res.end(contents);
                }
            });
        } else {
            self.notFound(filepath, res);
        }
    });
};

PreviewServer.prototype.notFound = function (filepath, res) {
    res.writeHead(404);
    res.end('Not Found: ' + filepath);
};

PreviewServer.prototype.initRoutes = function () {
    this._routes = {};
    this._project_routes = {};
};

PreviewServer.prototype.addRoute = function (path, callback) {
    this._routes[path] = callback;
};

PreviewServer.prototype.hasRoute = function (path) {
    return !!this._routes[path];
};

PreviewServer.prototype.addProjectRoute = function (path, callback) {
    this._project_routes[path] = callback;
};

PreviewServer.prototype.hasProjectRoute = function (path) {
    return !!this._project_routes[path];
};

PreviewServer.prototype.serveProjectRoute = function (path, uri, req, res, project) {
    return this._project_routes[path].call(this, uri, req, res, project, this);
};

PreviewServer.prototype.pushToFront = function (res, func) {
    // Ugly but GOOD
    res.writeHead(200, {
        'Content-Type': 'application/javascript',
    });
    res.write(func.toString().substring(13, func.toString().length - 1));
    res.end();
};

exports.PreviewServer = PreviewServer;
