import esbuild from "esbuild";

let plugin = {
    name: "debug info",
    setup(build) {
        let startTime;
        build.onStart(() => {
            startTime = performance.now();
        });
        build.onEnd(async (result) => {
            console.log(await esbuild.analyzeMetafile(result.metafile));
            console.log(`Bundling files took ${performance.now() - startTime} ms.`);
        });
    }
}

let ctx = await esbuild.context({
    entryPoints: ['./src/app.ts'],    // Entry file for your application
    bundle: true,                       // Enable bundling
    outfile: './public/app.js',        // Output bundled file
    platform: 'browser',                // Target platform
    minify: true,                       // Minify output
    sourcemap: true,                     // Generate sourcemaps
    target: 'ES2022',
    treeShaking: true,
    format:"esm",
    keepNames: true,
    metafile: true,
    plugins: [plugin],
    loader: {
        '.wgsl': 'text'
    }
});

await ctx.watch()
