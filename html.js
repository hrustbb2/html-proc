#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const matchAll = require("match-all");
const pretty = require('pretty');
const shell = require('shelljs');

let pushContents = {};

function getExtend(templateContent)
{
    let regex = new RegExp('<!-- extend:([a-zA-Z0-9./]+) -->', 'gm');
    let result = regex.exec(templateContent);
    if(result){
        return result[1];
    }
    return false;
}

function getSectionsNames(templateContent)
{
    let regex = new RegExp('<!-- section:([a-zA-Z0-9.]+) -->', 'gm');
    return matchAll(templateContent, regex).toArray();
}

function getSectionsContents(templateContent)
{
    let sectionsNames = getSectionsNames(templateContent);
    result = {};
    for(let sectionName of sectionsNames){
        let regex = new RegExp('<!-- section:'+sectionName+' -->(.*)<!-- endsection:'+sectionName+' -->', 'gms');
        let content = regex.exec(templateContent);
        if(content){
            result[sectionName] = content[1];
        }
    }
    return result;
}

function getIncludes(content)
{
    let regex = new RegExp('<!-- include:([a-zA-Z0-9./]+) -->', 'gm');
    return matchAll(content, regex).toArray();
}

function replaceInclude(content, tmpDir, includeFileName)
{
    let regex = new RegExp('<!-- include:'+includeFileName+' -->', 'gm');
    let includeContent = fs.readFileSync(tmpDir +'/'+ includeFileName).toString();
    includeContent = extractPushContents(includeContent);
    return content.replace(regex, includeContent.trim());
}

function replaceSection(extendContent, sectionContent, sectionName, tmpDir)
{
    let regex = new RegExp('<!-- yield:'+sectionName+' -->', 'gm');
    let includes = getIncludes(sectionContent);
    for(let includeFileName of includes){
        sectionContent = replaceInclude(sectionContent, tmpDir, includeFileName);
    }
    return extendContent.replace(regex, sectionContent.trim());
}

function getStacks(content)
{
    let regex = new RegExp('<!-- stack:([a-zA-Z0-9]+) -->', 'gm');
    return matchAll(content, regex).toArray();
}

function getPushSectionsNames(content)
{
    let regex = new RegExp('<!-- push:([a-zA-Z0-9]+) -->', 'gm');
    return matchAll(content, regex).toArray();
}

function extractPushContents(content)
{
    let pushSections = getPushSectionsNames(content);
    for(let sectionName of pushSections){
        let regex = new RegExp('<!-- push:'+sectionName+' -->(.*)<!-- endpush:'+sectionName+' -->', 'gms');
        pushContent = regex.exec(content);
        if(pushContent){
            if(pushContents[sectionName] === undefined){
                pushContents[sectionName] = [];
            }
            if(pushContents[sectionName].indexOf(pushContent[1].trim()) == -1){
                pushContents[sectionName].push(pushContent[1].trim());
            }
        }
        content = content.replace(regex, '');
    }
    
    return content;
}

function replaceStacks(content)
{
    let stacks = getStacks(content);
    for(let stack of stacks){
        let regex = new RegExp('<!-- stack:'+stack+' -->', 'gm');
        if(pushContents[stack]){
            content = content.replace(regex, pushContents[stack]);
        }
    }
    return content;
}

function buildTemplate(fileName, distDir)
{
    pushContents = {};
    let tmpDir = path.dirname(fileName);
    let templateContent = fs.readFileSync(fileName).toString();
    templateContent = extractPushContents(templateContent);
    let extend = getExtend(templateContent);
    if(!extend){
        console.log('in ' + fileName + ' not specify extend:');
        return;
    }
    let extendContent = fs.readFileSync(tmpDir+'/'+extend).toString();
    let sectionsContents = getSectionsContents(templateContent);
    for(let sectionName in sectionsContents){
        extendContent = replaceSection(extendContent, sectionsContents[sectionName], sectionName, tmpDir);
    }
    let includes = getIncludes(extendContent);
    for(let includeFileName of includes){
        extendContent = replaceInclude(extendContent, tmpDir, includeFileName);
    }
    extendContent = replaceStacks(extendContent);
    extendContent = pretty(extendContent, {indent_size: 4});
    let compiledFileName = path.basename(fileName);
    fs.writeFile(distDir+'/'+compiledFileName, extendContent, function(err){
        if(err) {
            return console.log(err);
        }
        console.log(fileName + ' builded');
    });
}

let configFile = process.argv[2];
if(configFile){
    let configDir = path.dirname(__dirname + '/../../' + configFile);
    let configContent = fs.readFileSync(__dirname + '/../../' + configFile);
    let configObj = JSON.parse(configContent);
    for(let src in configObj.files){
        let dest = configObj.files[src];
        shell.mkdir('-p', configDir + '/' + dest);
        buildTemplate(configDir + '/' + src, configDir + '/' + dest);
    }
}