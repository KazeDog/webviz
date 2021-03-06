// @flow
//
//  Copyright (c) 2018-present, Cruise LLC
//
//  This source code is licensed under the Apache License, Version 2.0,
//  found in the LICENSE file in the root directory of this source tree.
//  You may not use this file except in compliance with the License.

import AccountIcon from "@mdi/svg/svg/account.svg";
import CheckIcon from "@mdi/svg/svg/check.svg";
import CloseIcon from "@mdi/svg/svg/close.svg";
import { noop } from "lodash";
import * as React from "react";

import Modal, { Title } from "webviz-core/src/components/Modal";
import Radio from "webviz-core/src/components/Radio";
import TextContent from "webviz-core/src/components/TextContent";
import Tooltip from "webviz-core/src/components/Tooltip";
import { getGlobalHooks } from "webviz-core/src/loadWebviz";
import colors from "webviz-core/src/styles/colors.module.scss";
import Storage from "webviz-core/src/util/Storage";

// All these are exported for tests; please don't use them directly in your code.
export type FeatureDescriptions = {
  [id: string]: {|
    name: string,
    description: string | React.Node,
    developmentDefault: boolean,
    productionDefault: boolean,
  |},
};
export type FeatureStorage = { [id: string]: "alwaysOn" | "alwaysOff" };
export type FeatureSettings = { [id: string]: { enabled: boolean, manuallySet: boolean } };
export const EXPERIMENTAL_FEATURES_STORAGE_KEY = "experimentalFeaturesSettings";

function getExperimentalFeaturesList(): FeatureDescriptions {
  return getGlobalHooks().experimentalFeaturesList();
}

function getDefaultKey(): "productionDefault" | "developmentDefault" {
  return process.env.NODE_ENV === "production" ? "productionDefault" : "developmentDefault";
}

function getExperimentalFeatureSettings(): FeatureSettings {
  const experimentalFeaturesList = getExperimentalFeaturesList();
  const settings: FeatureSettings = {};
  const featureStorage = new Storage().get<FeatureStorage>(EXPERIMENTAL_FEATURES_STORAGE_KEY) || {};
  for (const id in experimentalFeaturesList) {
    if (["alwaysOn", "alwaysOff"].includes(featureStorage[id])) {
      settings[id] = { enabled: featureStorage[id] === "alwaysOn", manuallySet: true };
    } else {
      settings[id] = { enabled: experimentalFeaturesList[id][getDefaultKey()], manuallySet: false };
    }
  }
  return settings;
}

let subscribedComponents: (() => void)[] = [];

function useAllExperimentalFeatures(): FeatureSettings {
  const [settings, setSettings] = React.useState<FeatureSettings>(() => getExperimentalFeatureSettings());
  React.useEffect(() => {
    function update() {
      setSettings(getExperimentalFeatureSettings());
    }
    subscribedComponents.push(update);
    return () => {
      subscribedComponents = subscribedComponents.filter((fn) => fn !== update);
    };
  }, []);

  return settings;
}

export function useExperimentalFeature(id: string): boolean {
  const settings = useAllExperimentalFeatures();
  if (!settings[id]) {
    return false;
  }
  return settings[id].enabled;
}

// NOT RECOMMENDED! Whenever possible, use `useExperimentalFeature`, since that will make sure that
// the UI automatically rerenders when a feature is toggled. Only use `getExperimentalFeature` for
// features that are not closely tied to React.
export function getExperimentalFeature(id: string): boolean {
  const settings = getExperimentalFeatureSettings();
  if (!settings[id]) {
    return false;
  }
  return settings[id].enabled;
}

export function setExperimentalFeature(id: string, value: "default" | "alwaysOn" | "alwaysOff"): void {
  const storage = new Storage();
  const newSettings = { ...storage.get(EXPERIMENTAL_FEATURES_STORAGE_KEY) };

  const { logger, eventNames } = getGlobalHooks().getEventLogger();
  logger({ name: eventNames.CHANGE_EXPERIMENTAL_FEATURE, tags: { feature: id, value } });

  if (value === "default") {
    delete newSettings[id];
  } else {
    newSettings[id] = value;
  }
  storage.set(EXPERIMENTAL_FEATURES_STORAGE_KEY, newSettings);
  for (const update of subscribedComponents) {
    update();
  }
}

function IconOn() {
  return (
    <Tooltip contents="on" placement="top">
      <span>
        <CheckIcon style={{ fill: colors.green, verticalAlign: "-6px" }} />
      </span>
    </Tooltip>
  );
}

function IconOff() {
  return (
    <Tooltip contents="off" placement="top">
      <span>
        <CloseIcon style={{ fill: colors.red, verticalAlign: "-6px" }} />
      </span>
    </Tooltip>
  );
}

function IconManuallySet() {
  return (
    <Tooltip contents="manually set" placement="top">
      <span>
        <AccountIcon style={{ fill: colors.orange, verticalAlign: "-6px" }} />
      </span>
    </Tooltip>
  );
}

export function ExperimentalFeaturesModal(props: {|
  onRequestClose?: () => void,
  listForStories?: FeatureDescriptions,
  settingsForStories?: FeatureSettings,
|}) {
  const actualSettings = useAllExperimentalFeatures();
  const settings = props.settingsForStories || actualSettings;
  const list = props.listForStories || getExperimentalFeaturesList();

  return (
    <Modal onRequestClose={props.onRequestClose || noop}>
      <div style={{ maxWidth: 500, maxHeight: "90vh", overflow: "auto" }}>
        <Title>Experimental features</Title>
        <hr />
        <div style={{ padding: "32px" }}>
          <TextContent>
            <p>
              Enable or disable any experimental features. These settings will be stored your the browser???s{" "}
              <a href="https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage">local storage</a> for{" "}
              <em>{window.location.host}</em>. They will <em>not</em> be associated with your layout, user account, or
              persisted in any backend.
            </p>
            {Object.keys(list).length === 0 && (
              <p>
                <em>Currently there are no experimental features.</em>
              </p>
            )}
          </TextContent>
          {Object.keys(list).map((id: string) => {
            const feature = list[id];
            return (
              <div key={id} style={{ marginTop: 24 }}>
                <TextContent>
                  <h2>
                    {feature.name} <code style={{ fontSize: 12 }}>{id}</code>{" "}
                    <span style={{ whiteSpace: "nowrap" }}>
                      {settings[id].enabled ? <IconOn /> : <IconOff />}
                      {settings[id].manuallySet ? <IconManuallySet /> : undefined}
                    </span>
                  </h2>
                  {feature.description}
                </TextContent>
                <div style={{ marginTop: 8 }}>
                  <Radio
                    selectedId={
                      settings[id].manuallySet ? (settings[id].enabled ? "alwaysOn" : "alwaysOff") : "default"
                    }
                    onChange={(value) => {
                      if (value !== "default" && value !== "alwaysOn" && value !== "alwaysOff") {
                        throw new Error(`Invalid value for radio button: ${value}`);
                      }
                      setExperimentalFeature(id, value);
                    }}
                    options={[
                      {
                        id: "default",
                        label: `Default for ${window.location.host} (${feature[getDefaultKey()] ? "on" : "off"})`,
                      },
                      { id: "alwaysOn", label: "Always on" },
                      { id: "alwaysOff", label: "Always off" },
                    ]}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
