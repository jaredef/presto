export function generateAuthPages() {
  return {
    login: `<!-- Layer 0: Login form with signed action token. Zero client JS.
     htx:action generates an HMAC-SHA256 token for the login mutation.
     Escape: add client-side validation (Layer 2). -->

<section class="app-section" style="max-width:400px;margin:2rem auto">
  <h1>Login</h1>
  <htx:component src="/ui/form.htx" action="login" type="user">
    <htx:component src="/ui/input.htx" label="Username" type="text" name="username" required="required" />
    <htx:component src="/ui/input.htx" label="Password" type="password" name="password" required="required" />
  </htx:component>
  <p style="margin-top:1rem;text-align:center">
    <a href="/register">Create an account</a>
  </p>
</section>
`,
    register: `<!-- Layer 0: Registration form. Same pattern as login.
     Escape: add password strength indicator (Layer 2). -->

<section class="app-section" style="max-width:400px;margin:2rem auto">
  <h1>Register</h1>
  <htx:component src="/ui/form.htx" action="register" type="user">
    <htx:component src="/ui/input.htx" label="Username" type="text" name="username" required="required" />
    <htx:component src="/ui/input.htx" label="Password" type="password" name="password" required="required" />
  </htx:component>
  <p style="margin-top:1rem;text-align:center">
    <a href="/login">Already have an account?</a>
  </p>
</section>
`,
  };
}
