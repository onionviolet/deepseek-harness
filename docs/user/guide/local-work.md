# Local scripts and file work

English | [中文](local-work.zh.md)

## Summary

Use Local work for existing scripts, text and CSV processing, small script changes, and questions about a project. It extends the smaller coding tool set with skill loading and task tracking; Web also offers user questions and file delivery. The local model, sandbox, approval policy and durable session infrastructure stay the same.

## Table of Contents

- [Run a task](#run-a-task)
- [Use the Web preset](#use-the-web-preset)
- [Load script instructions](#load-script-instructions)
- [Check results](#check-results)

<a id="run-a-task"></a>
## Run a task

The [launcher](../../../apps/cli/config/examples/local-work/run.sh) runs the shipped headless profile with the [Local work overlay](../../../apps/cli/config/examples/local-work/headless.patch.yml). Set `harness_checkout` to the checkout's absolute path and run from the folder containing your files:

```sh
"$harness_checkout/apps/cli/config/examples/local-work/run.sh" "Explain the script and its inputs. Make no changes."
```

A local wrapper can expose this launcher as `dsh-work`. It preserves the current directory and passes headless options through. Use `--json` to receive the durable session id, then `--session-id <id>` on a later call to continue that task. The launcher uses the existing `dsh` command, including its configured Node runtime; it does not start another agent service.

<a id="use-the-web-preset"></a>
## Use the Web preset

The [Web overlay](../../../apps/cli/config/examples/local-work/web.patch.yml) declares the custom `local-work` preset. Apply it once as a profile layer or invocation overlay to a profile without that declaration. Do not append the same declaration again to an already configured profile. Select Local work as the new-session default in General settings. Existing sessions keep their previous preset.

Select Workspace write for a task that creates or edits files; choosing a preset does not change the access mode.

The preset includes direct file tools, search, shell, job controls, skills, todo, user questions and `present` for verified output files. It omits delegation, model-backed web search, plugin management and image tools. These omissions reduce prompt size; they do not restrict what shell commands can do. Permission modes still own confinement.

<a id="load-script-instructions"></a>
## Load script instructions

The bundled [local-scripts skill](../../../apps/cli/config/examples/local-work/skills/local-scripts/SKILL.md) covers script inspection, existing environments, output verification and recovery. Put it under `$DSH_HOME/skills/local-scripts/SKILL.md` for the normal filesystem skill provider to discover. Compare any existing file before replacing it. Project-specific instructions and skills remain available through the normal project roots.

Ask the model to use `local-scripts` when running an unfamiliar script. Its summary is not the full procedure: the model must load the skill before following it.

<a id="check-results"></a>
## Check results

A useful request names the input, script, output directory and expected result. For example: inspect the script and its help, summarize a CSV into a new output file, verify counts and totals, and leave the input unchanged. Paths containing spaces must be quoted.

For a script change, reproduce the failure, make a bounded edit and run its check. Review actual files, not only the model's completion message. Browser userscripts can be inspected and tested as code; installing them in a browser or submitting portal data is a separate action.

Local work is not an unattended scheduler. Sending, submitting, spending, publishing and deleting user data retain their specific authorization requirements.

## Dev Note

The Web composition test checks the 18-tool catalog and loads the bundled script skill from an isolated filesystem provider. The `local-work-tools` recorded-session scenario checks the headless overlay. Live synthetic script receipts belong in local evidence, not private project logs copied into the repository.
