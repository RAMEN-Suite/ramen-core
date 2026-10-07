import { Modeller as RootModeller } from '@ramen-suite/core';
import * as rootExports from '@ramen-suite/core';
import * as modelExports from '@ramen-suite/core/model';
import * as ramenExports from '@ramen-suite/core/ramen';
import { DataTypes, Modeller, type ModelFile, type Node } from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RamenModel } from '@ramen-suite/core/ramen';
import schema from '@ramen-suite/core/schemas/model-file.schema.json' with { type: 'json' };

for (const entry of [modelExports, ramenExports]) {
  for (const [name, value] of Object.entries(entry)) {
    if ((rootExports as Record<string, unknown>)[name] !== value) {
      throw new Error(`The root and subpath exports have different identities for ${name}.`);
    }
  }
}
if (!(RootModeller.create('Root identity') instanceof Modeller)) {
  throw new Error('Model instances must retain their class identity across entry points.');
}

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
