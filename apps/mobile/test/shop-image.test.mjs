import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/utils/shop-image.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {resolveShopImage}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('catalogue photos resolve against the same API on web, phone and production',()=>{
 assert.equal(resolveShopImage('/media/shop/bone-123.png','http://localhost:3333/v1'),'http://localhost:3333/media/shop/bone-123.png');
 assert.equal(resolveShopImage('/media/shop/bone-123.png','http://192.168.0.10:3333/v1'),'http://192.168.0.10:3333/media/shop/bone-123.png');
 assert.equal(resolveShopImage('/media/shop/bone-123.png','https://api.example.com/v1'),'https://api.example.com/media/shop/bone-123.png');
 assert.equal(resolveShopImage('https://cdn.example.com/photo.jpg','https://api.example.com/v1'),'https://cdn.example.com/photo.jpg');
 for(const value of ['/media/shop/../.env','/media/shop/folder/private.png','http://untrusted.example/photo.png','javascript:test','data:image/png;123'])assert.equal(resolveShopImage(value,'http://localhost:3333/v1'),undefined);
});
