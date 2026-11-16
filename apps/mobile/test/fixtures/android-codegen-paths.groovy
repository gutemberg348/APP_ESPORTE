// Runs the actual init script in Groovy with fake Gradle task properties.
// No Gradle daemon, Android plugin, codegen command or compiler is started.
import org.codehaus.groovy.control.CompilerConfiguration
import org.codehaus.groovy.control.customizers.ImportCustomizer

def loader = new GroovyClassLoader(getClass().classLoader)
loader.parseClass('''
package com.facebook.react.tasks
class FixtureProperty {
    Object value
    Object get() { value }
    void set(Object next) { value = next instanceof File ? new Expando(asFile: next) : next }
    boolean isPresent() { value != null }
}
class FixtureTask {
    String path = ':fixture:codegen'
    FixtureProperty nodeWorkingDir = new FixtureProperty()
    FixtureProperty generatedSrcDir = new FixtureProperty()
    File processDirectory
    Object property(String name) { this."$name" }
    void workingDir(File directory) { processDirectory = directory }
}
class GenerateCodegenSchemaTask extends FixtureTask {
    FixtureProperty codegenDir = new FixtureProperty()
    FixtureProperty jsRootDir = new FixtureProperty()
}
class GenerateCodegenArtifactsTask extends FixtureTask {
    FixtureProperty reactNativeDir = new FixtureProperty()
    FixtureProperty packageJsonFile = new FixtureProperty()
}
class DecoratedSchema extends GenerateCodegenSchemaTask {}
''')
def schemaType = loader.loadClass('com.facebook.react.tasks.DecoratedSchema')
def artifactsType = loader.loadClass('com.facebook.react.tasks.GenerateCodegenArtifactsTask')
def otherType = loader.loadClass('com.facebook.react.tasks.FixtureTask')
def original = new File(System.getenv('LOCAL_APP_ORIGINAL_ROOT'))
def alias = new File(System.getenv('LOCAL_APP_SHORT_ROOT'))
def library = new File(original, 'node_modules/react-native-keyboard-controller/android')
def tasks = []
def schema = schemaType.getDeclaredConstructor().newInstance()
schema.nodeWorkingDir.set(library.absolutePath)
schema.codegenDir.set(new File(alias, 'node_modules/@react-native/codegen'))
schema.generatedSrcDir.set(new File(library, 'build/generated/source/codegen'))
schema.jsRootDir.set(new File(original, 'node_modules/react-native-keyboard-controller/src'))
tasks << schema
def artifacts = artifactsType.getDeclaredConstructor().newInstance()
artifacts.nodeWorkingDir.set(library.absolutePath)
artifacts.reactNativeDir.set(new File(alias, 'node_modules/react-native'))
artifacts.generatedSrcDir.set(new File(library, 'build/generated/source/codegen'))
artifacts.packageJsonFile.set(new File(original, 'node_modules/react-native-keyboard-controller/package.json'))
tasks << artifacts
def app = schemaType.getDeclaredConstructor().newInstance()
app.nodeWorkingDir.set(new File(alias, 'apps/mobile/android/app').absolutePath)
app.codegenDir.set(new File(alias, 'node_modules/@react-native/codegen'))
app.generatedSrcDir.set(new File(alias, 'apps/mobile/android/app/build/generated/source/codegen'))
app.jsRootDir.set(new File(alias, 'apps/mobile'))
tasks << app
def unrelated = otherType.getDeclaredConstructor().newInstance()
unrelated.nodeWorkingDir.set('unchanged')
tasks << unrelated

// Reproduce the reported mixed-root failure before applying our hook.
boolean failed = false
try { library.toPath().relativize(schema.codegenDir.get().asFile.toPath()) }
catch (IllegalArgumentException expected) { failed = true }
assert failed

def callbacks = []
def fakeGradle = new Expando(
    projectsEvaluated: { action -> callbacks << action },
    beforeProject: { action -> /* Android/signing plugin hooks are not run. */ },
    rootProject: new Expando(allprojects: [new Expando(tasks: new Expando(configureEach: { action -> tasks.each(action) }))])
)
def compiler = new CompilerConfiguration()
compiler.addCompilationCustomizers(new ImportCustomizer().addImports('org.gradle.api.GradleException'))
new GroovyShell(loader, new Binding([gradle: fakeGradle]), compiler).evaluate(new File(args[0]))
assert callbacks.size() == 1
callbacks.each { it.call() }
for (task in [schema, artifacts, app]) {
    def base = new File(task.nodeWorkingDir.get())
    assert base.toPath().startsWith(original.toPath())
    assert task.processDirectory == base
    for (name in ['codegenDir', 'reactNativeDir', 'jsRootDir', 'generatedSrcDir', 'packageJsonFile']) {
        if (!task.hasProperty(name)) continue
        def target = task.property(name).get().asFile
        assert target.toPath().startsWith(original.toPath())
        def relative = base.toPath().relativize(target.toPath())
        assert base.toPath().resolve(relative).normalize() == target.toPath().normalize()
    }
}
assert schema.codegenDir.get().asFile == new File(original, 'node_modules/@react-native/codegen')
assert unrelated.nodeWorkingDir.get() == 'unchanged'
assert unrelated.processDirectory == null
// A second application is harmless and keeps paths stable.
callbacks.each { it.call() }
assert schema.nodeWorkingDir.get() == library.absolutePath

// Never silently point an external dependency on another disk at this workspace.
schema.jsRootDir.set(new File('Z:/outside-project/src'))
failed = false
try { callbacks.each { it.call() } }
catch (org.gradle.api.GradleException expected) { failed = expected.message.contains('unidades diferentes') }
assert failed
println 'Codegen mixed roots reproduced and normalized; no build or global settings changed.'
