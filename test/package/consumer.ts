import { Modeller as RootModeller } from '@ramen-suite/core';
import * as rootExports from '@ramen-suite/core';
import * as modelExports from '@ramen-suite/core/model';
import * as ramenExports from '@ramen-suite/core/ramen';
import { DataTypes, Modeller, type ModelFile, type ModelInstanceGraph, type Node } from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RamenModel, RamenValidationProfiles } from '@ramen-suite/core/ramen';
import schema from '@ramen-suite/core/schemas/model-file.schema.json' with { type: 'json' };

type PublicValidator<T> = 'validateWorkspace' extends keyof T ? never : T;

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
const validator: PublicValidator<modelExports.ModelValidator> = new modelExports.ModelValidator();
const document: Node = model.createNode('Document').element;
model.createAttribute(document, { name: 'title', typeId: DataTypes.String });
const file: ModelFile = model.export({ name: 'Independent project title', description: 'Preserved project description.' });
if (Modeller.import(file).getProjectMetadata()?.name !== file.project?.name) {
  throw new Error('Project metadata must survive package exchange independently of model names.');
}

const modelValid: boolean = validator.validateProject(model.getModel().id, model.getModels()).valid;
if (file.$schema !== schema.$id || !Modeller.import(file).validate().valid || !modelValid) {
  throw new Error('The installed RMF package cannot exchange a model using its packaged schema.');
}

const edition: RamenModel = RamenModel.create('Edition');
const ramenValidator: PublicValidator<ramenExports.RamenValidator> = new ramenExports.RamenValidator();
const letter: Node = edition.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;

const editionValid: boolean = ramenValidator.validateProject(edition.getModel().id, edition.getModels()).valid;
if (
  !RamenModel.import(edition.export()).validate().valid ||
  !RootModeller.create('Root export').validate().valid ||
  !editionValid
) {
  throw new Error('The installed RAMEN or root entry point is invalid.');
}

const historical: ModelInstanceGraph = {
  nodes: [{ id: 'letterRecord0001', typeId: letter.id, properties: { uuid: 'MAIN_ed_isx_tgn_r5b', label: 'Letter' } }],
  relations: [],
};
const profile: modelExports.InstanceValidationProfile = RamenValidationProfiles.LEGACY_IDENTIFIERS;
const accepted: modelExports.ValidationResult = edition.validateInstances(historical, { profile });
if (!edition.validateInstances(historical).hasErrors || accepted.hasErrors || accepted.diagnostics[0]?.severity !== 'warn') {
  throw new Error('The installed package must support opt-in profiles while preserving strict defaults.');
}
