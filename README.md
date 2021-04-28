## samltool.io

> **⚠️ Deprecation warning**: This is the old codebase for samltool.io, which has been replaced by [v2](https://github.com/auth0/samltool-v2)

### How to build

> Warning: `index.html` in the root folder is a generated file please edit `html/index.html`.

First, install the required dependencies:

```sh
npm install && bower install
```

In order to build (and run) the project execute:

```sh
grunt
```

And then go to http://0.0.0.0:8000.

That will create the css from the less files, minify the javascript and generate `index.html` from `html/index.html`. 


### Happy hacking!


