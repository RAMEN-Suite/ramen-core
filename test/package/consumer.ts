import { Modeller as RootModeller } from '@ramen-suite/core';
import { DataTypes, Modeller, type ModelFile, type Node } from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RamenModel } from '@ramen-suite/core/ramen';
import schema from '@ramen-suite/core/schemas/model-file.schema.json' with { type: 'json' };

const model: Modeller = Modeller.create('Package consumer');
const document: Node = model.createNode('Document').element;
model.createAttribute(document, { name: 'title', typeId: DataTypes.String });
const file: ModelFile = model.export();

if (file.$schema !== schema.$id || !Modeller.import(file).validate().valid) {
  throw new Error('The installed RMF package cannot exchange a model using its packaged schema.');
}

const edition: RamenModel = RamenModel.create('Edition');
edition.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION });

if (!RamenModel.import(edition.export()).validate().valid || !RootModeller.create('Root export').validate().valid) {
  throw new Error('The installed RAMEN or root entry point is invalid.');
}
