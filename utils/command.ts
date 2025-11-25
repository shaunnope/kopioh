export async function runCommand(command: string | URL, args?: string[] | undefined) {
  const cmd = new Deno.Command(
  command, { 
    args: args 
  });

return await cmd.output();
}

export function logOuput(output: Deno.CommandOutput) {
  if (output.code != 0)
    console.log(new TextDecoder().decode(output.stderr));
  console.log(new TextDecoder().decode(output.stdout));
}