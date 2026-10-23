using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Interact3D.Models;
using Microsoft.IdentityModel.Tokens;

namespace Interact3D.Helpers;

public static class JwtHelper
{
    public static string GenerateToken(tbl_User user, IConfiguration configuration)
    {
        var secretKey = configuration["Jwt:Key"] ?? "Interact3D_SuperSecretKey_MustBeLongEnough_2026!";
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.GivenName, user.DisplayName ?? user.Username),
            new Claim(ClaimTypes.Role, user.Role)
        };

        var token = new JwtSecurityToken(
            issuer: configuration["Jwt:Issuer"] ?? "Interact3D",
            audience: configuration["Jwt:Audience"] ?? "Interact3DClient",
            claims: claims,
            expires: DateTime.UtcNow.AddDays(7),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}